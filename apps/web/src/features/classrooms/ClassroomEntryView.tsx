import React, { useState, useEffect, useContext } from 'react';
import {
  Plus,
  KeyRound,
  GraduationCap,
  Users,
  Presentation,
  Play,
  ArrowRight,
  ChevronRight,
  LogIn,
} from 'lucide-react';
import {
  ClassroomService,
  type MyClassroomsResponse,
  type ClassroomSummary,
} from '../../services/api';
import { AuthContext } from '../../providers/AuthContext';
import { CreateClassroomModal } from './CreateClassroomModal';
import { JoinClassroomModal } from './JoinClassroomModal';
import { StudentDetailsModal } from './StudentDetailsModal';
import { ProjectorViewModal } from './ProjectorViewModal';

interface ClassroomEntryViewProps {
  onOpenClassroom: (classroom: ClassroomSummary, role: 'owner' | 'student') => void;
  onResumeExam: (resumeInfo: { classroom_id: string; classroom_name: string; assignment_id: string }) => void;
  onShowToast?: (title: string, description?: string, type?: 'success' | 'info' | 'error') => void;
}

export const ClassroomEntryView: React.FC<ClassroomEntryViewProps> = ({
  onOpenClassroom,
  onResumeExam,
  onShowToast,
}) => {
  const authCtx = useContext(AuthContext);
  const isAuthenticated = authCtx?.isAuthenticated ?? true;

  const [data, setData] = useState<MyClassroomsResponse>({
    owned: [],
    joined: [],
    active_exam_resume: null,
  });
  const [isLoading, setIsLoading] = useState(true);

  // Modals
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [prefilledJoinCode, setPrefilledJoinCode] = useState('');
  const [detailsClassroomId, setDetailsClassroomId] = useState<string | null>(null);

  // Projector view from entry
  const [projectorData, setProjectorData] = useState<{
    code: string;
    name: string;
    courseId?: string | null;
  } | null>(null);

  // Active section tab: 'all' | 'owned' | 'joined'
  const [activeTab, setActiveTab] = useState<'all' | 'owned' | 'joined'>('all');

  const fetchMyClassrooms = async () => {
    setIsLoading(true);
    try {
      const res = await ClassroomService.listMyClassrooms();
      setData(res);
    } catch (err: any) {
      onShowToast?.('Fetch Error', err.message || 'Could not load your classrooms.', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchMyClassrooms();

    // Check URL parameters for ?join=CODE or ?code=CODE (Part B2 / C3)
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      const codeFromUrl = urlParams.get('join') || urlParams.get('code');
      if (codeFromUrl) {
        setPrefilledJoinCode(codeFromUrl);
        setShowJoinModal(true);
      }
    }
  }, []);

  const handleJoinSuccess = (classroomId: string, status: string) => {
    setShowJoinModal(false);
    fetchMyClassrooms();
    if (status === 'joined') {
      // Prompt for details completion
      setDetailsClassroomId(classroomId);
    }
  };

  const getStatusBadge = (s: string) => {
    switch (s) {
      case 'in_progress':
        return 'bg-[#F59E0B]/20 text-[#F59E0B] border-[#F59E0B]/40';
      case 'submitted':
        return 'bg-[#00D4FF]/20 text-[#00D4FF] border-[#00D4FF]/40';
      case 'graded':
        return 'bg-[#00F5A0]/20 text-[#00F5A0] border-[#00F5A0]/40';
      case 'pending_approval':
        return 'bg-[#A855F7]/20 text-[#A855F7] border-[#A855F7]/40';
      default:
        return 'bg-[#1C1534] text-[#9E93B8] border-[rgba(107,92,166,0.3)]';
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto px-2 py-4">
      {/* Signed-out banner (Part B2) */}
      {!isAuthenticated && (
        <div className="rounded-2xl p-5 bg-[#EF4444]/10 border border-[#EF4444]/30 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <LogIn className="w-6 h-6 text-[#EF4444]" />
            <div>
              <div className="text-sm font-bold text-[#F5F1EC]">Authentication Required</div>
              <div className="text-xs text-[#9E93B8]">
                Please sign in to access your university lab classrooms or join an exam session.
              </div>
            </div>
          </div>
          <button
            onClick={() => {
              // Redirect to login preserving code in query
              window.location.href = `/login?redirect=${encodeURIComponent(window.location.pathname + window.location.search)}`;
            }}
            className="px-4 py-2 rounded-xl bg-[#EF4444] text-white font-bold text-xs hover:bg-[#DC2626] transition-all"
          >
            Sign In Now
          </button>
        </div>
      )}

      {/* Hero / Two Clear Actions (Part B1) */}
      <div className="rounded-3xl p-6 md:p-8 bg-gradient-to-r from-[#151026] via-[#1C1534] to-[#151026] border border-[rgba(107,92,166,0.3)] shadow-2xl space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs font-mono font-bold text-[#00D4FF] uppercase tracking-wider">
              <GraduationCap className="w-4 h-4" />
              <span>University Examination & Lab Platform</span>
            </div>
            <h1 className="text-2xl md:text-3xl font-extrabold text-[#F5F1EC]">
              Classroom Hub
            </h1>
            <p className="text-xs md:text-sm text-[#9E93B8] max-w-2xl">
              Conduct official lab practical examinations, verify student pipelines with automated rubrics, and inspect reproducibility telemetry.
            </p>
          </div>

          {/* Two Primary Action Buttons (Part B1) */}
          <div className="flex items-center gap-3 flex-wrap">
            <button
              onClick={() => setShowCreateModal(true)}
              data-testid="create-classroom-btn"
              className="flex items-center gap-2 px-5 py-3 rounded-2xl bg-gradient-to-r from-[#00D4FF] to-[#00F5A0] text-xs font-extrabold text-[#0B0912] shadow-xl hover:opacity-95 transition-all transform hover:-translate-y-0.5"
            >
              <Plus className="w-4 h-4 stroke-[2.5]" />
              <span>Create Classroom</span>
            </button>

            <button
              onClick={() => {
                setPrefilledJoinCode('');
                setShowJoinModal(true);
              }}
              data-testid="join-classroom-btn"
              className="flex items-center gap-2 px-5 py-3 rounded-2xl bg-[#241B42] hover:bg-[#2E2254] text-xs font-extrabold text-[#F5F1EC] border border-[rgba(107,92,166,0.4)] shadow-xl transition-all transform hover:-translate-y-0.5"
            >
              <KeyRound className="w-4 h-4 text-[#00D4FF]" />
              <span>Join Classroom</span>
            </button>
          </div>
        </div>

        {/* Resume Exam Banner (Part B1) */}
        {data.active_exam_resume && (
          <div
            data-testid="resume-exam-banner"
            className="p-4 rounded-2xl bg-gradient-to-r from-[#241B42] to-[#1C1534] border border-[#00D4FF]/40 flex flex-wrap items-center justify-between gap-4 shadow-lg animate-pulse"
          >
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-[#00D4FF]/20 text-[#00D4FF]">
                <Play className="w-5 h-5 fill-current" />
              </div>
              <div>
                <div className="text-[11px] font-mono text-[#00D4FF] uppercase tracking-wider font-bold">
                  Active Examination In Progress
                </div>
                <div className="text-sm font-bold text-[#F5F1EC]">
                  {data.active_exam_resume.classroom_name}
                </div>
              </div>
            </div>

            <button
              onClick={() => onResumeExam(data.active_exam_resume!)}
              data-testid="resume-exam-btn"
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#00D4FF] hover:bg-[#00F5A0] text-[#0B0912] font-extrabold text-xs transition-all shadow-md"
            >
              <span>Resume Exam</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* My Classrooms Section (Part B1) */}
      <div className="space-y-4">
        <div className="flex items-center justify-between border-b border-[rgba(107,92,166,0.2)] pb-3 flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold text-[#F5F1EC]">My Classrooms</h2>
            <span className="text-xs text-[#9E93B8]">
              ({data.owned.length + data.joined.length} Total)
            </span>
          </div>

          <div className="flex items-center gap-1.5 bg-[#151026] p-1 rounded-xl border border-[rgba(107,92,166,0.25)] text-xs">
            <button
              onClick={() => setActiveTab('all')}
              className={`px-3 py-1 rounded-lg font-semibold transition-all ${
                activeTab === 'all'
                  ? 'bg-[#241B42] text-[#00D4FF]'
                  : 'text-[#9E93B8] hover:text-white'
              }`}
            >
              All
            </button>
            <button
              onClick={() => setActiveTab('owned')}
              className={`px-3 py-1 rounded-lg font-semibold transition-all ${
                activeTab === 'owned'
                  ? 'bg-[#241B42] text-[#00D4FF]'
                  : 'text-[#9E93B8] hover:text-white'
              }`}
            >
              Instructor ({data.owned.length})
            </button>
            <button
              onClick={() => setActiveTab('joined')}
              className={`px-3 py-1 rounded-lg font-semibold transition-all ${
                activeTab === 'joined'
                  ? 'bg-[#241B42] text-[#00D4FF]'
                  : 'text-[#9E93B8] hover:text-white'
              }`}
            >
              Student ({data.joined.length})
            </button>
          </div>
        </div>

        {isLoading ? (
          <div className="py-16 text-center text-[#00D4FF] font-mono animate-pulse text-xs">
            Syncing enrolled classrooms and lab sections...
          </div>
        ) : (
          <div className="space-y-6">
            {/* 1. Owned Classrooms (Instructor) */}
            {(activeTab === 'all' || activeTab === 'owned') && data.owned.length > 0 && (
              <div className="space-y-3">
                <div className="text-xs uppercase font-mono tracking-wider text-[#9E93B8] flex items-center gap-2">
                  <Users className="w-3.5 h-3.5 text-[#00D4FF]" />
                  <span>Classrooms I Own (Instructor Mode)</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {data.owned.map((c) => (
                    <div
                      key={c.id}
                      className="p-5 rounded-2xl bg-[#151026] border border-[rgba(107,92,166,0.25)] hover:border-[#00D4FF]/40 transition-all flex flex-col justify-between space-y-4 group shadow-lg"
                    >
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-[#00D4FF]/15 text-[#00D4FF] font-bold">
                            {c.course_id || 'LAB'}
                          </span>
                          <span className="text-xs text-[#9E93B8] font-mono">
                            {c.member_count} Enrolled
                          </span>
                        </div>
                        <h3 className="text-sm font-bold text-[#F5F1EC] group-hover:text-[#00D4FF] transition-colors line-clamp-1">
                          {c.name}
                        </h3>
                        {c.description && (
                          <p className="text-xs text-[#9E93B8] line-clamp-2">{c.description}</p>
                        )}
                      </div>

                      <div className="pt-3 border-t border-[rgba(107,92,166,0.15)] flex items-center justify-between gap-2">
                        {c.join_code && (
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] text-[#9E93B8]">Code:</span>
                            <span className="font-mono font-bold text-xs text-[#00D4FF]">
                              {c.join_code}
                            </span>
                          </div>
                        )}

                        <div className="flex items-center gap-1.5 ml-auto">
                          {c.join_code && (
                            <button
                              onClick={() =>
                                setProjectorData({
                                  code: c.join_code!,
                                  name: c.name,
                                  courseId: c.course_id,
                                })
                              }
                              title="Projector View"
                              className="p-1.5 rounded-lg bg-[#1C1534] hover:bg-[#241B42] text-[#00D4FF] transition-colors"
                            >
                              <Presentation className="w-3.5 h-3.5" />
                            </button>
                          )}

                          <button
                            onClick={() => onOpenClassroom(c, 'owner')}
                            className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-[#241B42] hover:bg-[#2E2254] text-[#F5F1EC] font-bold text-xs border border-[rgba(107,92,166,0.3)] transition-all"
                          >
                            <span>Manage Roster</span>
                            <ChevronRight className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 2. Joined Classrooms (Student) */}
            {(activeTab === 'all' || activeTab === 'joined') && data.joined.length > 0 && (
              <div className="space-y-3">
                <div className="text-xs uppercase font-mono tracking-wider text-[#9E93B8] flex items-center gap-2">
                  <GraduationCap className="w-3.5 h-3.5 text-[#00F5A0]" />
                  <span>Enrolled Classrooms (Student Mode)</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {data.joined.map((c) => (
                    <div
                      key={c.id}
                      className="p-5 rounded-2xl bg-[#151026] border border-[rgba(107,92,166,0.25)] hover:border-[#00F5A0]/40 transition-all flex flex-col justify-between space-y-4 group shadow-lg"
                    >
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-[#00F5A0]/15 text-[#00F5A0] font-bold">
                            {c.course_id || 'LAB'}
                          </span>
                          <span
                            className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full border ${getStatusBadge(
                              c.status
                            )}`}
                          >
                            {c.status.replace('_', ' ').toUpperCase()}
                          </span>
                        </div>
                        <h3 className="text-sm font-bold text-[#F5F1EC] group-hover:text-[#00F5A0] transition-colors line-clamp-1">
                          {c.name}
                        </h3>
                        {c.description && (
                          <p className="text-xs text-[#9E93B8] line-clamp-2">{c.description}</p>
                        )}
                      </div>

                      <div className="pt-3 border-t border-[rgba(107,92,166,0.15)] flex items-center justify-between gap-2">
                        {c.user_score !== null && c.user_score !== undefined ? (
                          <div className="text-xs font-mono font-bold text-[#00F5A0]">
                            Score: {c.user_score} / 100
                          </div>
                        ) : (
                          <span className="text-[11px] text-[#9E93B8]">
                            {c.status === 'in_progress' ? 'Exam in progress' : 'Ready'}
                          </span>
                        )}

                        <button
                          onClick={() => onOpenClassroom(c, 'student')}
                          className="flex items-center gap-1 px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-[#00D4FF] to-[#00F5A0] text-[#0B0912] font-bold text-xs shadow transition-all hover:opacity-90 ml-auto"
                        >
                          <span>{c.status === 'in_progress' ? 'Resume' : 'Enter Exam'}</span>
                          <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Empty State */}
            {data.owned.length === 0 && data.joined.length === 0 && (
              <div className="p-12 text-center rounded-3xl bg-[#151026] border border-[rgba(107,92,166,0.25)] space-y-4">
                <div className="w-12 h-12 rounded-2xl bg-[#241B42] text-[#00D4FF] mx-auto flex items-center justify-center">
                  <GraduationCap className="w-6 h-6" />
                </div>
                <div className="space-y-1">
                  <h3 className="text-sm font-bold text-[#F5F1EC]">No Classrooms Found</h3>
                  <p className="text-xs text-[#9E93B8] max-w-sm mx-auto">
                    You have not created any classrooms or joined an exam session yet. Click below to begin.
                  </p>
                </div>
                <div className="flex justify-center gap-3">
                  <button
                    onClick={() => setShowCreateModal(true)}
                    className="px-4 py-2 rounded-xl bg-gradient-to-r from-[#00D4FF] to-[#00F5A0] text-xs font-bold text-[#0B0912]"
                  >
                    Create Classroom
                  </button>
                  <button
                    onClick={() => setShowJoinModal(true)}
                    className="px-4 py-2 rounded-xl bg-[#241B42] text-xs font-bold text-[#F5F1EC] border border-[rgba(107,92,166,0.3)]"
                  >
                    Join with Code
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Create Classroom Modal */}
      {showCreateModal && (
        <CreateClassroomModal
          onClose={() => setShowCreateModal(false)}
          onCreated={() => {
            fetchMyClassrooms();
          }}
          onOpenProjector={(code, name, courseId) => {
            setProjectorData({ code, name, courseId });
          }}
          onShowToast={onShowToast}
        />
      )}

      {/* Join Classroom Modal */}
      {showJoinModal && (
        <JoinClassroomModal
          initialCode={prefilledJoinCode}
          onClose={() => setShowJoinModal(false)}
          onJoined={handleJoinSuccess}
          onShowToast={onShowToast}
        />
      )}

      {/* Student Details Gate Modal */}
      {detailsClassroomId && (
        <StudentDetailsModal
          classroomId={detailsClassroomId}
          onClose={() => setDetailsClassroomId(null)}
          onSaved={() => {
            setDetailsClassroomId(null);
            fetchMyClassrooms();
          }}
          onShowToast={onShowToast}
        />
      )}

      {/* Fullscreen Projector View */}
      {projectorData && (
        <ProjectorViewModal
          joinCode={projectorData.code}
          classroomName={projectorData.name}
          courseId={projectorData.courseId}
          onClose={() => setProjectorData(null)}
        />
      )}
    </div>
  );
};
