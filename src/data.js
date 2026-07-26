import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  limit,
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
import { currentWeekKey, generateClassCode, normalizeClassCode } from './utils';

const text = (value, fallback = '') => typeof value === 'string' ? value : fallback;
const number = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;
const mapSnapshot = (snapshot, normalize = (item) => item) => snapshot.docs.map((item) => normalize({ id: item.id, ...item.data() }));

const normalizeAssignment = (item) => ({
  ...item,
  title: text(item.title, 'Untitled assignment'),
  description: text(item.description),
  subject: text(item.subject, 'Classwork'),
  kind: text(item.kind, 'Work'),
  authorId: text(item.authorId),
  authorName: text(item.authorName, 'Class member'),
  attachments: Array.isArray(item.attachments)
    ? item.attachments.filter((file) => file && typeof file === 'object').map((file, index) => ({
      ...file,
      name: text(file.name, `Attachment ${index + 1}`),
      type: text(file.type, 'application/octet-stream'),
      url: text(file.url),
      size: number(file.size)
    })).filter((file) => file.url)
    : [],
  upvotes: number(item.upvotes),
  downvotes: number(item.downvotes),
  score: number(item.score),
  reportCount: number(item.reportCount),
  reported: Boolean(item.reported)
});

const normalizeMessage = (item) => ({
  ...item,
  body: text(item.body, 'Message unavailable'),
  authorId: text(item.authorId),
  authorName: text(item.authorName, 'Class member')
});

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
    xp: 0,
    weeklyXp: 0,
    xpWeek: currentWeekKey(),
    monthlyXp: 0,
    xpMonth: new Date().toISOString().slice(0, 7),
    yearlyXp: 0,
    xpYear: String(new Date().getUTCFullYear()),
    streakDays: 0,
    lastContributionDate: '',
    equippedBadge: '',
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
    xp: 0,
    weeklyXp: 0,
    xpWeek: currentWeekKey(),
    monthlyXp: 0,
    xpMonth: new Date().toISOString().slice(0, 7),
    yearlyXp: 0,
    xpYear: String(new Date().getUTCFullYear()),
    streakDays: 0,
    lastContributionDate: '',
    equippedBadge: '',
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
  return onSnapshot(query(collection(db, 'classrooms', classId, 'assignments'), orderBy('createdAt', 'desc')), (snapshot) => onData(mapSnapshot(snapshot, normalizeAssignment)), onError);
}

export function subscribeAnnouncements(classId, onData, onError) {
  return onSnapshot(query(collection(db, 'classrooms', classId, 'announcements'), orderBy('createdAt', 'desc')), (snapshot) => onData(mapSnapshot(snapshot)), onError);
}

export function subscribeSchedule(classId, onData, onError) {
  return onSnapshot(
    query(collection(db, 'classrooms', classId, 'schedule'), orderBy('date', 'asc')),
    (snapshot) => onData(mapSnapshot(snapshot)),
    onError
  );
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

export async function updateMemberRole(classId, uid, role) {
  if (!['member', 'contributor'].includes(role)) throw new Error('Choose a valid classroom role.');
  await updateDoc(doc(db, 'classrooms', classId, 'members', uid), { role });
}

export async function removeMember(classId, uid) {
  const batch = writeBatch(db);
  batch.delete(doc(db, 'classrooms', classId, 'members', uid));
  batch.delete(doc(db, 'users', uid, 'classrooms', classId));
  await batch.commit();
}

async function awardXp(classId, uid, amount) {
  const memberRef = doc(db, 'classrooms', classId, 'members', uid);
  const week = currentWeekKey();
  const today = new Date().toISOString().slice(0, 10);
  const month = today.slice(0, 7);
  const year = today.slice(0, 4);
  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(memberRef);
    if (!snapshot.exists()) return;
    const member = snapshot.data();
    const yesterday = new Date(`${today}T00:00:00.000Z`);
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    const yesterdayKey = yesterday.toISOString().slice(0, 10);
    const isNewDay = member.lastContributionDate !== today;
    const streakDays = isNewDay
      ? (member.lastContributionDate === yesterdayKey ? number(member.streakDays) + 1 : 1)
      : number(member.streakDays);
    const streakBonus = isNewDay ? Math.min(streakDays, 7) * 2 : 0;
    const earned = amount + streakBonus;
    transaction.update(memberRef, {
      xp: Math.max(0, number(member.xp) + earned),
      weeklyXp: member.xpWeek === week ? Math.max(0, number(member.weeklyXp) + earned) : earned,
      xpWeek: week,
      monthlyXp: member.xpMonth === month ? Math.max(0, number(member.monthlyXp) + earned) : earned,
      xpMonth: month,
      yearlyXp: member.xpYear === year ? Math.max(0, number(member.yearlyXp) + earned) : earned,
      xpYear: year,
      streakDays,
      lastContributionDate: isNewDay ? today : member.lastContributionDate
    });
  });
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
  await awardXp(classId, user.uid, 20).catch(() => {});
  return assignmentRef.id;
}

export async function removeAssignment(classId, assignmentId) {
  await deleteDoc(doc(db, 'classrooms', classId, 'assignments', assignmentId));
}

export async function castVote(classId, assignmentId, user, value) {
  const uid = user.uid;
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
    if (current.authorId && current.authorId !== uid && next !== 0) {
      transaction.set(doc(db, 'classrooms', classId, 'members', current.authorId, 'notifications', `vote-${assignmentId}-${uid}`), {
        type: 'feedback',
        assignmentId,
        assignmentTitle: text(current.title, 'Your assignment'),
        recipientId: current.authorId,
        senderId: uid,
        senderName: text(user.displayName, 'A classmate'),
        body: next === 1 ? 'marked your work as correct.' : 'said your work needs another look.',
        createdAt: serverTimestamp()
      });
    }
    return next;
  });
}

export async function getMyVote(classId, assignmentId, uid) {
  const snapshot = await getDoc(doc(db, 'classrooms', classId, 'assignments', assignmentId, 'votes', uid));
  return snapshot.exists() ? snapshot.data().value : 0;
}

export function subscribeMessages(classId, assignmentId, onData, onError) {
  const source = query(
    collection(db, 'classrooms', classId, 'assignments', assignmentId, 'messages'),
    orderBy('createdAt', 'desc'),
    limit(150)
  );
  return onSnapshot(source, (snapshot) => onData(mapSnapshot(snapshot, normalizeMessage).reverse()), onError);
}

export async function sendMessage(classId, assignmentId, user, body) {
  const assignmentRef = doc(db, 'classrooms', classId, 'assignments', assignmentId);
  const assignmentSnap = await getDoc(assignmentRef);
  const assignment = assignmentSnap.data() || {};
  const batch = writeBatch(db);
  const messageRef = doc(collection(db, 'classrooms', classId, 'assignments', assignmentId, 'messages'));
  batch.set(messageRef, {
    body: body.trim(),
    authorId: user.uid,
    authorName: user.displayName,
    createdAt: serverTimestamp()
  });
  if (assignment.authorId && assignment.authorId !== user.uid) {
    batch.set(doc(collection(db, 'classrooms', classId, 'members', assignment.authorId, 'notifications')), {
      type: 'feedback',
      assignmentId,
      assignmentTitle: text(assignment.title, 'Your assignment'),
      recipientId: assignment.authorId,
      senderId: user.uid,
      senderName: text(user.displayName, 'A classmate'),
      body: 'replied in your assignment thread.',
      createdAt: serverTimestamp()
    });
  }
  await batch.commit();
}

export async function removeMessage(classId, assignmentId, messageId) {
  await deleteDoc(doc(db, 'classrooms', classId, 'assignments', assignmentId, 'messages', messageId));
}

export async function reportAssignment(classId, assignment, user, reason) {
  const assignmentRef = doc(db, 'classrooms', classId, 'assignments', assignment.id);
  const reportRef = doc(db, 'classrooms', classId, 'assignments', assignment.id, 'reports', user.uid);
  await runTransaction(db, async (transaction) => {
    const [assignmentSnap, reportSnap] = await Promise.all([transaction.get(assignmentRef), transaction.get(reportRef)]);
    if (!assignmentSnap.exists()) throw new Error('This assignment is no longer available.');
    if (reportSnap.exists()) throw new Error('You already reported this work.');
    const current = assignmentSnap.data();
    transaction.set(reportRef, {
      reporterId: user.uid,
      reporterName: text(user.displayName, 'Class member'),
      reason: text(reason, 'Something is seriously wrong with this upload.'),
      createdAt: serverTimestamp()
    });
    transaction.update(assignmentRef, {
      reportCount: number(current.reportCount) + 1,
      reported: true,
      updatedAt: serverTimestamp()
    });
    if (current.authorId && current.authorId !== user.uid) {
      transaction.set(doc(collection(db, 'classrooms', classId, 'members', current.authorId, 'notifications')), {
        type: 'report',
        assignmentId: assignment.id,
        assignmentTitle: text(current.title, 'Your assignment'),
        recipientId: current.authorId,
        senderId: user.uid,
        senderName: text(user.displayName, 'A classmate'),
        body: 'reported a serious problem with your uploaded work.',
        createdAt: serverTimestamp()
      });
    }
  });
}

export function subscribeNotifications(classId, uid, onData, onError) {
  return onSnapshot(
    query(collection(db, 'classrooms', classId, 'members', uid, 'notifications'), orderBy('createdAt', 'desc'), limit(100)),
    (snapshot) => onData(mapSnapshot(snapshot)),
    onError
  );
}

export async function updateUserProfile(user, classIds, values) {
  const batch = writeBatch(db);
  batch.set(doc(db, 'users', user.uid), {
    displayName: values.displayName,
    photoURL: values.photoURL || '',
    updatedAt: serverTimestamp()
  }, { merge: true });
  classIds.forEach((classId) => {
    batch.set(doc(db, 'classrooms', classId, 'members', user.uid), {
      name: values.displayName,
      photoURL: values.photoURL || '',
      equippedBadge: values.equippedBadge || ''
    }, { merge: true });
  });
  await batch.commit();
}

export async function createAnnouncement(classId, user, values) {
  await addDoc(collection(db, 'classrooms', classId, 'announcements'), {
    title: values.title.trim(),
    body: values.body.trim(),
    tone: values.tone,
    pinned: values.pinned,
    expiresOn: values.expiresOn || null,
    authorId: user.uid,
    authorName: user.displayName,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
  await awardXp(classId, user.uid, 8).catch(() => {});
}

export async function removeAnnouncement(classId, announcementId) {
  await deleteDoc(doc(db, 'classrooms', classId, 'announcements', announcementId));
}

export async function createScheduleEvent(classId, user, values) {
  await addDoc(collection(db, 'classrooms', classId, 'schedule'), {
    title: values.title.trim(),
    details: values.details.trim(),
    date: values.date,
    startTime: values.startTime || '',
    endTime: values.endTime || '',
    type: values.type,
    authorId: user.uid,
    authorName: user.displayName,
    createdAt: serverTimestamp()
  });
  await awardXp(classId, user.uid, 5).catch(() => {});
}

export async function removeScheduleEvent(classId, eventId) {
  await deleteDoc(doc(db, 'classrooms', classId, 'schedule', eventId));
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
