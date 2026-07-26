import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Avatar, CustomDatePicker, ThreadsPage, TimetablePage } from './App';

const user = { uid: 'member-1', displayName: null };
const activeClass = { id: 'class-1', name: '10B' };

describe('resilient classroom rendering', () => {
  it('renders missing legacy profile names without crashing', () => {
    expect(renderToStaticMarkup(<Avatar name={null} />)).toContain('CM');
  });

  it('renders the thread shell with normalized assignment data', () => {
    const html = renderToStaticMarkup(
      <ThreadsPage
        assignments={[{ id: 'work-1', title: 'Untitled assignment', subject: 'Classwork', authorName: 'Class member' }]}
        activeClass={activeClass}
        user={user}
        isOwner={false}
        setSelectedAssignment={() => {}}
        showNotice={() => {}}
      />
    );
    expect(html).toContain('Assignment threads');
    expect(html).toContain('Untitled assignment');
  });

  it('renders the custom calendar and shared timetable', () => {
    expect(renderToStaticMarkup(<CustomDatePicker label="Due date" value="2026-07-26" onChange={() => {}} />)).toContain('Jul 26, 2026');
    const html = renderToStaticMarkup(
      <TimetablePage
        schedule={[]}
        assignments={[{ id: 'work-1', title: 'Revision', dueDate: '2026-07-26' }]}
        announcements={[]}
        isContributor
        isOwner
        activeClass={activeClass}
        user={user}
        setModal={() => {}}
        showNotice={() => {}}
        setSelectedAssignment={() => {}}
      />
    );
    expect(html).toContain('Class timetable');
  });
});
