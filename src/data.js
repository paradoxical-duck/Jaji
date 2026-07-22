import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch
} from 'firebase/firestore';
import { db } from './firebase';
import { generateClassCode, normalizeClassCode } from './utils';

const mapSnapshot = (snapshot) => snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));

async function getDocWithRetry(reference, attempts = 3) {
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await getDoc(reference);
    } catch (error) {
      lastError = error;
      if (attempt < attempts - 1) await new Promise((resolve) => setTimeout(resolve, 300 * (attempt + 1)));
    }
  }
  throw lastError;
}

export async function createClassroom(user, details) {
  const classRef = doc(collection(db, 'classrooms'));
  let code = generateClassCode();
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const codeDoc = await getDoc(doc(db, 'joinCodes', code));
    if (!codeDoc.exists()) break;
    code = generateClassCode();
  }

  const classData = {
    name: details.name.trim(),
    subject: 'Classroom',
    section: '',
    description: '',
    code,
    ownerId: user.uid,
    ownerName: user.displayName,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };
  const batch = writeBatch(db);
  batch.set(classRef, classData);
  batch.set(doc(db, 'joinCodes', code), { classId: classRef.id, ownerId: user.uid });
  batch.set(doc(db, 'classrooms', classRef.id, 'members', user.uid), {
    uid: user.uid,
    name: user.displayName,
    email: user.email,
    role: 'owner',
    joinedAt: serverTimestamp()
  });
  batch.set(doc(db, 'users', user.uid, 'classrooms', classRef.id), {
    classId: classRef.id,
    joinedAt: serverTimestamp()
  });
  await batch.commit();
  return { id: classRef.id, ...classData };
}

export async function joinClassroom(user, rawCode) {
  const code = normalizeClassCode(rawCode);
  if (code.length !== 6) throw new Error('Enter the complete 6-character class code.');
  const codeSnap = await getDoc(doc(db, 'joinCodes', code));
  if (!codeSnap.exists()) throw new Error('That class code was not found. Check it and try again.');
  const { classId } = codeSnap.data();

  const batch = writeBatch(db);
  batch.set(doc(db, 'classrooms', classId, 'members', user.uid), {
    uid: user.uid,
    name: user.displayName,
    email: user.email,
    role: 'member',
    joinCode: code,
    joinedAt: serverTimestamp()
  }, { merge: true });
  batch.set(doc(db, 'users', user.uid, 'classrooms', classId), {
    classId,
    joinedAt: serverTimestamp()
  }, { merge: true });
  await batch.commit();
  const classSnap = await getDoc(doc(db, 'classrooms', classId));
  if (!classSnap.exists()) throw new Error('That classroom is no longer available.');
  return { id: classId, ...classSnap.data() };
}

export function subscribeUserClassrooms(uid, onData, onError) {
  return onSnapshot(collection(db, 'users', uid, 'classrooms'), async (snapshot) => {
    try {
      const classes = await Promise.all(snapshot.docs.map(async (reference) => {
        const classSnap = await getDocWithRetry(doc(db, 'classrooms', reference.id));
        return classSnap.exists() ? { id: classSnap.id, ...classSnap.data() } : null;
      }));
      onData(classes.filter(Boolean));
    } catch (error) {
      onError(error);
    }
  }, onError);
}

export function subscribeMember(classId, uid, onData, onError) {
  return onSnapshot(doc(db, 'classrooms', classId, 'members', uid), (snapshot) => {
    onData(snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null);
  }, onError);
}

export function subscribeMembers(classId, onData, onError) {
  return onSnapshot(query(collection(db, 'classrooms', classId, 'members'), orderBy('joinedAt', 'asc')), (snapshot) => onData(mapSnapshot(snapshot)), onError);
}

export function subscribeAssignments(classId, onData, onError) {
  return onSnapshot(query(collection(db, 'classrooms', classId, 'assignments'), orderBy('createdAt', 'desc')), (snapshot) => onData(mapSnapshot(snapshot)), onError);
}

export function subscribeAnnouncements(classId, onData, onError) {
  return onSnapshot(query(collection(db, 'classrooms', classId, 'announcements'), orderBy('createdAt', 'desc')), (snapshot) => onData(mapSnapshot(snapshot)), onError);
}

export function subscribeContributorRequests(classId, uid, isOwner, onData, onError) {
  const source = isOwner
    ? collection(db, 'classrooms', classId, 'contributorRequests')
    : doc(db, 'classrooms', classId, 'contributorRequests', uid);
  return onSnapshot(source, (snapshot) => {
    if (isOwner) onData(mapSnapshot(snapshot));
    else onData(snapshot.exists() ? [{ id: snapshot.id, ...snapshot.data() }] : []);
  }, onError);
}

export async function requestContributor(classId, user, note) {
  await setDoc(doc(db, 'classrooms', classId, 'contributorRequests', user.uid), {
    requesterId: user.uid,
    requesterName: user.displayName,
    requesterEmail: user.email,
    note: note.trim(),
    status: 'pending',
    createdAt: serverTimestamp(),
    reviewedAt: null
  });
}

export async function reviewContributorRequest(classId, request, approved) {
  const batch = writeBatch(db);
  batch.update(doc(db, 'classrooms', classId, 'contributorRequests', request.id), {
    status: approved ? 'approved' : 'declined',
    reviewedAt: serverTimestamp()
  });
  if (approved) {
    batch.update(doc(db, 'classrooms', classId, 'members', request.id), { role: 'contributor' });
  }
  await batch.commit();
}

export async function createAssignment(classId, user, values, attachments = []) {
  const assignmentRef = doc(collection(db, 'classrooms', classId, 'assignments'));
  await setDoc(assignmentRef, {
    title: values.title.trim(),
    description: values.description.trim(),
    subject: values.subject.trim(),
    kind: values.kind,
    dueDate: values.dueDate || null,
    attachments,
    authorId: user.uid,
    authorName: user.displayName,
    upvotes: 0,
    downvotes: 0,
    score: 0,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
  return assignmentRef.id;
}

export async function castVote(classId, assignmentId, uid, value) {
  const assignmentRef = doc(db, 'classrooms', classId, 'assignments', assignmentId);
  const voteRef = doc(db, 'classrooms', classId, 'assignments', assignmentId, 'votes', uid);
  return runTransaction(db, async (transaction) => {
    const [assignmentSnap, voteSnap] = await Promise.all([transaction.get(assignmentRef), transaction.get(voteRef)]);
    if (!assignmentSnap.exists()) throw new Error('This assignment is no longer available.');
    const current = assignmentSnap.data();
    const previous = voteSnap.exists() ? voteSnap.data().value : 0;
    const next = previous === value ? 0 : value;
    const upvotes = Math.max(0, (current.upvotes || 0) - (previous === 1 ? 1 : 0) + (next === 1 ? 1 : 0));
    const downvotes = Math.max(0, (current.downvotes || 0) - (previous === -1 ? 1 : 0) + (next === -1 ? 1 : 0));
    transaction.update(assignmentRef, { upvotes, downvotes, score: upvotes - downvotes, updatedAt: serverTimestamp() });
    if (next === 0) transaction.delete(voteRef);
    else transaction.set(voteRef, { value: next, updatedAt: serverTimestamp() });
    return next;
  });
}

export async function getMyVote(classId, assignmentId, uid) {
  const snapshot = await getDoc(doc(db, 'classrooms', classId, 'assignments', assignmentId, 'votes', uid));
  return snapshot.exists() ? snapshot.data().value : 0;
}

export function subscribeMessages(classId, assignmentId, onData, onError) {
  return onSnapshot(query(collection(db, 'classrooms', classId, 'assignments', assignmentId, 'messages'), orderBy('createdAt', 'asc')), (snapshot) => onData(mapSnapshot(snapshot)), onError);
}

export async function sendMessage(classId, assignmentId, user, body) {
  await addDoc(collection(db, 'classrooms', classId, 'assignments', assignmentId, 'messages'), {
    body: body.trim(),
    authorId: user.uid,
    authorName: user.displayName,
    createdAt: serverTimestamp()
  });
}

export async function createAnnouncement(classId, user, values) {
  await addDoc(collection(db, 'classrooms', classId, 'announcements'), {
    title: values.title.trim(),
    body: values.body.trim(),
    tone: values.tone,
    pinned: values.pinned,
    authorId: user.uid,
    authorName: user.displayName,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
}

export async function removeAnnouncement(classId, announcementId) {
  await deleteDoc(doc(db, 'classrooms', classId, 'announcements', announcementId));
}

export async function leaveClassroom(classId, uid) {
  const batch = writeBatch(db);
  batch.delete(doc(db, 'classrooms', classId, 'members', uid));
  batch.delete(doc(db, 'users', uid, 'classrooms', classId));
  await batch.commit();
}

export async function updateClassroom(classId, values) {
  await updateDoc(doc(db, 'classrooms', classId), { ...values, updatedAt: serverTimestamp() });
}
