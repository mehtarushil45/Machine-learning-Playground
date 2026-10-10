import React, { useState, useEffect } from 'react';
import {
  Search,
  Download,
  KeyRound,
  RefreshCw,
  Eye,
  Check,
  X,
  Trash2,
  Clock,
  Presentation,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import {
  ClassroomService,
  type RosterMemberItem,
  type RosterPaginationResponse,
} from '../../services/api';
import { ParticipantInspectionModal } from './ParticipantInspectionModal';
import { ProjectorViewModal } from './ProjectorViewModal';

interface ClassroomRosterTabProps {
  classroom: {
    id: string;
    name: string;
    course_id?: string | null;
    join_code?: string | null;
    join_code_active?: boolean;
    is_archived?: boolean;
  };
  onShowToast?: (title: string, description?: string, type?: 'success' | 'info' | 'error') => void;
  onRefreshClassroom?: () => void;
}

export const ClassroomRosterTab: React.FC<ClassroomRosterTabProps> = ({
  classroom,
  onShowToast,
  onRefreshClassroom,
}) => {
  const [data, setData] = useState<RosterPaginationResponse>({
    items: [],
    total: 0,
    page: 1,
    page_size: 25,
    total_pages: 1,
  });
  const [isLoading, setIsLoading] = useState(true);

  // Filters and Pagination
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [division, setDivision] = useState('');
  const [batch, setBatch] = useState('');
  const [status, setStatus] = useState('');

  // Code state
  const [currentCode, setCurrentCode] = useState(classroom.join_code || '');
  const [codeActive, setCodeActive] = useState(classroom.join_code_active ?? true);
  const [isResettingCode, setIsResettingCode] = useState(false);
  const [isTogglingCode, setIsTogglingCode] = useState(false);

  // Modals
  const [inspectUserId, setInspectUserId] = useState<string | null>(null);
  const [showProjector, setShowProjector] = useState(false);

  const fetchRoster = async () => {
    setIsLoading(true);
    try {
      const res = await ClassroomService.getRosterPaginated(classroom.id, {
        page,
        page_size: 25,
        search: search.trim() || undefined,
        division: division || undefined,
        batch: batch || undefined,
        status: status || undefined,
      });
      setData(res);
    } catch (err: any) {
      onShowToast?.('Roster Error', err.message || 'Failed to load roster.', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchRoster();
  }, [classroom.id, page, division, batch, status]);

  // Debounced search
  useEffect(() => {
    const handler = setTimeout(() => {
      setPage(1);
      fetchRoster();
    }, 350);
    return () => clearTimeout(handler);
  }, [search]);

  // Code Reset (Part G4)
  const handleResetCode = async () => {
    if (!window.confirm('Resetting the join code will invalidate the current code for new students. Existing members stay enrolled. Proceed?')) {
      return;
    }
    setIsResettingCode(true);
    try {
      const res = await ClassroomService.resetJoinCode(classroom.id);
      setCurrentCode(res.join_code);
      onShowToast?.('Code Reset', `New Join Code generated: ${res.join_code}`, 'success');
      onRefreshClassroom?.();
    } catch (err: any) {
      onShowToast?.('Reset Failed', err.message || 'Could not reset code.', 'error');
    } finally {
      setIsResettingCode(false);
    }
  };

  // Toggle Join Code (Pause / Open)
  const handleToggleCode = async () => {
    setIsTogglingCode(true);
    const nextState = !codeActive;
    try {
      await ClassroomService.toggleJoinCode(classroom.id, nextState);
      setCodeActive(nextState);
      onShowToast?.(
        'Code Status Updated',
        nextState ? 'Join code is now accepting students.' : 'Join code is paused/closed.',
        'info'
      );
      onRefreshClassroom?.();
    } catch (err: any) {
      onShowToast?.('Action Failed', err.message, 'error');
    } finally {
      setIsTogglingCode(false);
    }
  };

  // Approve / Decline Member (Part G4)
  const handleApproval = async (userId: string, approve: boolean) => {
    try {
      await ClassroomService.setMemberApproval(classroom.id, userId, approve);
      onShowToast?.('Updated', approve ? 'Student approved.' : 'Join request declined.', 'success');
      fetchRoster();
    } catch (err: any) {
      onShowToast?.('Action Failed', err.message, 'error');
    }
  };

  // Time Extension (Part F2, G4)
  const handleTimeExtension = async (member: RosterMemberItem) => {
    const minsStr = window.prompt(`Grant time extension in minutes for ${member.full_name}:`, '15');
    if (!minsStr) return;
    const mins = parseInt(minsStr, 10);
    if (isNaN(mins) || mins <= 0) return;

    try {
      await ClassroomService.grantTimeExtension(classroom.id, member.user_id, mins);
      onShowToast?.('Extension Granted', `Added ${mins} minutes for ${member.full_name}.`, 'success');
      fetchRoster();
    } catch (err: any) {
      onShowToast?.('Extension Failed', err.message, 'error');
    }
  };

  // Reopen Submission (Part F2, G4)
  const handleReopen = async (member: RosterMemberItem) => {
    if (!window.confirm(`Reopen exam submission for ${member.full_name}? This allows them to edit and resubmit.`)) {
      return;
    }
    try {
      await ClassroomService.reopenSubmission(classroom.id, member.user_id, true);
      onShowToast?.('Submission Reopened', `Exam unlocked for ${member.full_name}.`, 'success');
      fetchRoster();
    } catch (err: any) {
      onShowToast?.('Reopen Failed', err.message, 'error');
    }
  };

  // Remove Participant (Part G4, H3)
  const handleRemove = async (member: RosterMemberItem) => {
    if (!window.confirm(`Remove ${member.full_name} from this classroom? They will lose access immediately.`)) {
      return;
    }
    try {
      await ClassroomService.removeMember(classroom.id, member.user_id);
      onShowToast?.('Member Removed', `${member.full_name} has been removed.`, 'info');
      fetchRoster();
    } catch (err: any) {
      onShowToast?.('Removal Failed', err.message, 'error');
    }
  };

  const getStatusBadge = (s: string) => {
    switch (s) {
      case 'graded':
        return 'bg-[#00F5A0]/20 text-[#00F5A0] border-[#00F5A0]/40';
      case 'submitted':
        return 'bg-[#00D4FF]/20 text-[#00D4FF] border-[#00D4FF]/40';
      case 'in_progress':
        return 'bg-[#F59E0B]/20 text-[#F59E0B] border-[#F59E0B]/40';
      case 'late':
        return 'bg-[#EF4444]/20 text-[#EF4444] border-[#EF4444]/40';
      case 'pending_approval':
        return 'bg-[#A855F7]/20 text-[#A855F7] border-[#A855F7]/40';
      case 'removed':
        return 'bg-[#3D3558] text-[#9E93B8] border-transparent';
      default:
        return 'bg-[#1C1534] text-[#9E93B8] border-[rgba(107,92,166,0.3)]';
    }
  };

  return (
    <div className="space-y-4">
      {/* Top Banner: Join Code & Quick Actions (Part C3, G4) */}
      <div className="rounded-2xl p-5 bg-[#151026] border border-[rgba(107,92,166,0.3)] flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="p-3 rounded-xl bg-[#241B42] text-[#00D4FF] border border-[#00D4FF]/30">
            <KeyRound className="w-6 h-6" />
          </div>
          <div>
            <div className="text-[11px] font-mono uppercase tracking-wider text-[#9E93B8] flex items-center gap-2">
              <span>Active Join Code</span>
              <span
                className={`px-2 py-0.2 rounded-full text-[10px] font-bold ${
                  codeActive ? 'bg-[#00F5A0]/20 text-[#00F5A0]' : 'bg-[#EF4444]/20 text-[#EF4444]'
                }`}
              >
                {codeActive ? 'OPEN' : 'PAUSED'}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <span
                data-testid="roster-active-code"
                className="font-mono font-black text-2xl md:text-3xl tracking-widest text-[#00D4FF]"
              >
                {currentCode || 'N/A'}
              </span>
            </div>
          </div>
        </div>

        {/* Code Controls */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setShowProjector(true)}
            data-testid="open-projector-btn"
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-gradient-to-r from-[#00D4FF] to-[#00F5A0] text-xs font-bold text-[#0B0912] shadow transition-all hover:opacity-90"
          >
            <Presentation className="w-4 h-4" />
            <span>Projector View (C3)</span>
          </button>

          <button
            onClick={handleToggleCode}
            disabled={isTogglingCode}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#1C1534] hover:bg-[#241B42] text-xs font-bold text-[#F5F1EC] border border-[rgba(107,92,166,0.3)] transition-all"
          >
            <span>{codeActive ? 'Pause Code' : 'Resume Code'}</span>
          </button>

          <button
            onClick={handleResetCode}
            disabled={isResettingCode}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#1C1534] hover:bg-[#241B42] text-xs font-bold text-[#F59E0B] border border-[#F59E0B]/30 transition-all"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isResettingCode ? 'animate-spin' : ''}`} />
            <span>Reset Code (G4)</span>
          </button>

          <a
            href={ClassroomService.getRosterExportCsvUrl(classroom.id)}
            download
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#1C1534] hover:bg-[#241B42] text-xs font-bold text-[#00F5A0] border border-[#00F5A0]/40 transition-all shadow"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export CSV (G2)</span>
          </a>
        </div>
      </div>

      {/* Filter and Search Bar (Part G1) */}
      <div className="rounded-2xl p-4 bg-[#151026] border border-[rgba(107,92,166,0.25)] flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2 flex-1 min-w-[240px]">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-[#9E93B8]" />
            <input
              type="text"
              placeholder="Search by student name or enrollment number..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 rounded-xl bg-[#0F0B1E] border border-[rgba(107,92,166,0.3)] text-[#F5F1EC] placeholder:text-[#9E93B8]/50 focus:outline-none focus:border-[#00D4FF]"
            />
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <input
            type="text"
            placeholder="Division (e.g. A)"
            value={division}
            onChange={(e) => setDivision(e.target.value.toUpperCase())}
            className="w-24 px-2.5 py-2 rounded-xl bg-[#0F0B1E] border border-[rgba(107,92,166,0.3)] text-[#F5F1EC] font-semibold text-center uppercase"
          />

          <input
            type="text"
            placeholder="Batch (e.g. B1)"
            value={batch}
            onChange={(e) => setBatch(e.target.value.toUpperCase())}
            className="w-24 px-2.5 py-2 rounded-xl bg-[#0F0B1E] border border-[rgba(107,92,166,0.3)] text-[#F5F1EC] font-semibold text-center uppercase"
          />

          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="px-3 py-2 rounded-xl bg-[#0F0B1E] border border-[rgba(107,92,166,0.3)] text-[#F5F1EC] font-semibold"
          >
            <option value="">All Statuses</option>
            <option value="joined">Joined</option>
            <option value="details_saved">Details Saved</option>
            <option value="in_progress">In Progress</option>
            <option value="submitted">Submitted</option>
            <option value="graded">Graded</option>
            <option value="late">Late</option>
            <option value="pending_approval">Pending Approval</option>
          </select>

          <button
            onClick={() => {
              setSearch('');
              setDivision('');
              setBatch('');
              setStatus('');
            }}
            className="px-3 py-2 rounded-xl bg-[#1C1534] hover:bg-[#241B42] text-[#9E93B8] hover:text-white transition-all"
          >
            Reset
          </button>
        </div>
      </div>

      {/* Roster Table (Part G1) */}
      <div className="rounded-2xl border border-[rgba(107,92,166,0.25)] bg-[#151026] overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-[rgba(107,92,166,0.2)] bg-[#1C1534]/50 text-[#9E93B8]">
                <th className="py-3 px-4 font-semibold">Student Name</th>
                <th className="py-3 px-4 font-semibold">Enrollment #</th>
                <th className="py-3 px-4 font-semibold">Div / Batch</th>
                <th className="py-3 px-4 font-semibold">Status</th>
                <th className="py-3 px-4 font-semibold">Score</th>
                <th className="py-3 px-4 font-semibold">Submission Time</th>
                <th className="py-3 px-4 font-semibold">Last Activity</th>
                <th className="py-3 px-4 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[rgba(107,92,166,0.15)] text-[#F5F1EC]">
              {isLoading ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-[#00D4FF] font-mono animate-pulse">
                    Loading classroom roster items...
                  </td>
                </tr>
              ) : data.items.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-[#9E93B8] italic">
                    No participants match the selected filters.
                  </td>
                </tr>
              ) : (
                data.items.map((m) => (
                  <tr
                    key={m.user_id}
                    className="hover:bg-[#1C1534]/40 transition-colors"
                  >
                    <td className="py-3 px-4 font-medium">
                      <div className="font-bold text-[#F5F1EC]">{m.full_name}</div>
                      <div className="text-[10px] text-[#7C6BAE] font-mono">{m.user_id}</div>
                    </td>
                    <td className="py-3 px-4 font-mono font-semibold text-[#00D4FF]">
                      {m.enrollment_number || '—'}
                    </td>
                    <td className="py-3 px-4 font-mono text-[#9E93B8]">
                      {m.division ? `Div ${m.division}` : '—'} • {m.batch || '—'}
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold border ${getStatusBadge(
                          m.status
                        )}`}
                      >
                        {m.status.replace('_', ' ').toUpperCase()}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-mono font-bold text-[#00F5A0]">
                      {m.score !== null ? `${m.score} / 100` : '—'}
                    </td>
                    <td className="py-3 px-4 text-[#9E93B8] text-[11px]">
                      {m.submission_time ? new Date(m.submission_time).toLocaleTimeString() : '—'}
                    </td>
                    <td className="py-3 px-4 text-[#9E93B8] text-[11px]">
                      {m.last_activity ? new Date(m.last_activity).toLocaleTimeString() : '—'}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {/* Approval buttons for pending members */}
                        {m.status === 'pending_approval' ? (
                          <>
                            <button
                              onClick={() => handleApproval(m.user_id, true)}
                              title="Approve student"
                              className="p-1.5 rounded-lg bg-[#00F5A0]/20 text-[#00F5A0] hover:bg-[#00F5A0]/30 transition-colors"
                            >
                              <Check className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleApproval(m.user_id, false)}
                              title="Decline student"
                              className="p-1.5 rounded-lg bg-[#EF4444]/20 text-[#EF4444] hover:bg-[#EF4444]/30 transition-colors"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </>
                        ) : (
                          <>
                            {/* Inspect */}
                            <button
                              onClick={() => setInspectUserId(m.user_id)}
                              title="Inspect participant (Code diff, timeline, rubric)"
                              className="px-2.5 py-1 rounded-lg bg-[#241B42] hover:bg-[#2E2254] text-[#00D4FF] border border-[#00D4FF]/30 font-semibold flex items-center gap-1 transition-all"
                            >
                              <Eye className="w-3 h-3" />
                              <span>Inspect</span>
                            </button>

                            {/* Extension */}
                            <button
                              onClick={() => handleTimeExtension(m)}
                              title="Grant time extension"
                              className="p-1.5 rounded-lg bg-[#1C1534] hover:bg-[#241B42] text-[#F59E0B] border border-[#F59E0B]/30 transition-all"
                            >
                              <Clock className="w-3.5 h-3.5" />
                            </button>

                            {/* Reopen */}
                            <button
                              onClick={() => handleReopen(m)}
                              title="Reopen submission"
                              className="p-1.5 rounded-lg bg-[#1C1534] hover:bg-[#241B42] text-[#00F5A0] border border-[#00F5A0]/30 transition-all"
                            >
                              <RefreshCw className="w-3.5 h-3.5" />
                            </button>

                            {/* Remove */}
                            <button
                              onClick={() => handleRemove(m)}
                              title="Remove participant"
                              className="p-1.5 rounded-lg bg-[#1C1534] hover:bg-[#EF4444]/20 text-[#EF4444] border border-[#EF4444]/30 transition-all"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Server-Side Pagination Footer (Part G1) */}
        <div className="p-4 border-t border-[rgba(107,92,166,0.2)] bg-[#1C1534]/30 flex items-center justify-between text-xs text-[#9E93B8]">
          <div>
            Showing{' '}
            <strong className="text-[#F5F1EC]">
              {data.items.length > 0 ? (page - 1) * 25 + 1 : 0}
            </strong>{' '}
            to{' '}
            <strong className="text-[#F5F1EC]">
              {Math.min(page * 25, data.total)}
            </strong>{' '}
            of <strong className="text-[#F5F1EC]">{data.total}</strong> enrolled participants
          </div>

          <div className="flex items-center gap-2">
            <button
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="p-1.5 rounded-lg bg-[#151026] border border-[rgba(107,92,166,0.3)] hover:text-white disabled:opacity-30 disabled:pointer-events-none"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="font-mono text-xs">
              Page {data.page} of {Math.max(1, data.total_pages)}
            </span>
            <button
              disabled={page >= data.total_pages}
              onClick={() => setPage((p) => Math.min(data.total_pages, p + 1))}
              className="p-1.5 rounded-lg bg-[#151026] border border-[rgba(107,92,166,0.3)] hover:text-white disabled:opacity-30 disabled:pointer-events-none"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Participant Inspection Modal */}
      {inspectUserId && (
        <ParticipantInspectionModal
          classroomId={classroom.id}
          userId={inspectUserId}
          onClose={() => setInspectUserId(null)}
          onShowToast={onShowToast}
        />
      )}

      {/* Projector View Modal */}
      {showProjector && (
        <ProjectorViewModal
          joinCode={currentCode}
          classroomName={classroom.name}
          courseId={classroom.course_id}
          onClose={() => setShowProjector(false)}
        />
      )}
    </div>
  );
};
