import { useEffect, useRef, useState } from 'react';

type Page = 'matches' | 'myMeetups' | 'messages' | 'profile';
type OnboardingMode = 'choice' | 'create';

type AuthMe = {
  authenticated: boolean;
  email?: string;
  name?: string;
  profile_id?: number | null;
  login_url: string;
  logout_url?: string;
};

type MatchItem = {
  profile_id: number;
  tag: string;
  is_anonymous: boolean;
  linkedin_url: string;
  pinned_location: string;
  profile_pic_url: string;
  profile_pic_uploaded_url: string;
  pitch_text: string;
  match_score: number;
  reasoning: string;
};

type Meetup = {
  id: string;
  title: string;
  place: string;
  timeText: string;
  meetupDate: string;
  meetupTime: string;
  upForItCount: number;
};

type MyMeetup = {
  id: string;
  title: string;
  place: string;
  time_text: string;
  meetup_date: string;
  meetup_time: string;
  role: 'Organizer' | 'Participant';
  up_for_it_count: number;
};

type ThreadSummary = {
  id: number;
  participants: { id: number; tag?: string }[];
  last_message: string;
  updated_at: string;
};

type ThreadMessage = {
  id: number;
  thread: number;
  sender: number;
  sender_role?: string;
  body: string;
  created_at: string;
};

const currentHost = typeof window !== 'undefined' ? window.location.hostname : '127.0.0.1';
const defaultProtocol = typeof window !== 'undefined' && window.location.protocol === 'https:' ? 'https' : 'http';
const normalizeBase = (value: string) => value.replace(/\/+$/, '');
const djangoBase = normalizeBase(import.meta.env.VITE_DJANGO_BASE_URL || `${defaultProtocol}://${currentHost}:8000`);
const apiBase = `${djangoBase}/api`;
const fastApiBase = normalizeBase(import.meta.env.VITE_FASTAPI_BASE_URL || `${defaultProtocol}://${currentHost}:8001`);
const wsBase = normalizeBase(
  import.meta.env.VITE_WS_BASE_URL ||
  `${defaultProtocol === 'https' ? 'wss' : 'ws'}://${currentHost}:8000`
);
const FASTAPI_API_KEY = import.meta.env.VITE_FASTAPI_API_KEY || '';
const onboardingDraftKey = 'map4expo:onboardingDraft:v1';
const threadReadKey = 'map4expo:threadRead:v1';
const carouselItems = [
  { label: '21 seconds voice-only profiles', icon: 'M12 2a3 3 0 0 0-3 3v6a3 3 0 1 0 6 0V5a3 3 0 0 0-3-3zM19 11a7 7 0 0 1-14 0M12 18v4' },
  { label: 'AI driven match-ups', icon: 'M12 21s-7-4.4-9-8.7C1.4 8.7 3.1 5 6.8 5c2.2 0 3.3 1.1 5.2 3 1.9-1.9 3-3 5.2-3C20.9 5 22.6 8.7 21 12.3 19 16.6 12 21 12 21z' },
  { label: 'Quick casual meetups', icon: 'M8 2v4M16 2v4M3 10h18M5 6h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z' },
  { label: '1:1 secure messaging', icon: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z' },
  { label: 'Privacy first design', icon: 'M12 2a5 5 0 0 0-5 5v4a5 5 0 0 0 10 0V7a5 5 0 0 0-5-5zM5 11v2a7 7 0 0 0 14 0v-2' },
];
const todayDate = () => new Date().toISOString().slice(0, 10);

const logAppError = (context: string, error: unknown, details?: unknown) => {
  console.error(`[Map4Expo][${context}]`, error, details ?? '');
};

const formatMeetupDateTime = (dateValue?: string, timeValue?: string) => {
  if (!dateValue) return '';
  const timePart = timeValue && timeValue.length >= 4 ? timeValue : '00:00';
  const date = new Date(`${dateValue}T${timePart}`);
  if (Number.isNaN(date.getTime())) return dateValue;
  return date.toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });
};

const formatMeetupDay = (dateValue?: string) => {
  if (!dateValue) return '';
  const date = new Date(`${dateValue}T00:00`);
  if (Number.isNaN(date.getTime())) return dateValue;
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
};

const formatMessageDateTime = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
};

const Glyph = ({ path, className = 'h-4 w-4' }: { path: string; className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
    <path d={path} />
  </svg>
);

export default function App() {
  const frontendOrigin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5173';
  const loginUrl = `${djangoBase}/accounts/google/login/?process=login&prompt=select_account&next=${encodeURIComponent(frontendOrigin)}`;
  const logoutUrl = `${djangoBase}/accounts/logout/?next=${encodeURIComponent(frontendOrigin)}`;

  const [page, setPage] = useState<Page>('matches');
  const [onboardingMode, setOnboardingMode] = useState<OnboardingMode>('choice');
  const [authMe, setAuthMe] = useState<AuthMe | null>(null);
  const [currentProfileId, setCurrentProfileId] = useState<number | null>(null);

  const [name, setName] = useState('');
  const [tag, setTag] = useState('');
  const [linkedinUrl, setLinkedinUrl] = useState('');
  const [pinnedLocation, setPinnedLocation] = useState('');

  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [pitchTranscript, setPitchTranscript] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);

  const [matches, setMatches] = useState<MatchItem[]>([]);
  const [meetups, setMeetups] = useState<Meetup[]>([]);
  const [myMeetups, setMyMeetups] = useState<MyMeetup[]>([]);
  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const [selectedThreadId, setSelectedThreadId] = useState<number | null>(null);
  const [threadMessages, setThreadMessages] = useState<ThreadMessage[]>([]);
  const [threadUnreadMap, setThreadUnreadMap] = useState<Record<number, boolean>>({});
  const [messageSocketStatus, setMessageSocketStatus] = useState<'connecting' | 'open' | 'closed'>('closed');
  const [expandedMeetupDays, setExpandedMeetupDays] = useState<Record<string, boolean>>({});

  const [meetupTitle, setMeetupTitle] = useState('');
  const [meetupPlace, setMeetupPlace] = useState('');
  const [meetupDate, setMeetupDate] = useState(todayDate());
  const [meetupTime, setMeetupTime] = useState('11:00');

  const [newMessageText, setNewMessageText] = useState('');

  const [error, setError] = useState('');
  const [meetupError, setMeetupError] = useState('');
  const [messageError, setMessageError] = useState('');
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordingChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<number | null>(null);
  const recordingStreamRef = useRef<MediaStream | null>(null);

  const autoCreateAttemptedRef = useRef(false);
  const getCsrfToken = () => {
    const name = 'csrftoken=';
    const found = document.cookie.split('; ').find((row) => row.startsWith(name));
    return found ? decodeURIComponent(found.slice(name.length)) : '';
  };

  const djangoFetch = (url: string, options?: RequestInit) => {
    const method = (options?.method || 'GET').toUpperCase();
    const headers = new Headers(options?.headers || {});
    if (!['GET', 'HEAD', 'OPTIONS', 'TRACE'].includes(method)) {
      const csrfToken = getCsrfToken();
      if (csrfToken) headers.set('X-CSRFToken', csrfToken);
    }
    return fetch(url, { credentials: 'include', ...options, headers });
  };

  const handleLogout = async () => {
    try {
      const response = await djangoFetch(`${apiBase}/auth/logout/`, { method: 'POST' });
      if (response.ok) {
        setAuthMe({ authenticated: false, login_url: loginUrl });
        setCurrentProfileId(null);
        setPage('matches');
        setOnboardingMode('choice');
        window.location.href = frontendOrigin;
        return;
      }
    } catch (err) {
      logAppError('handleLogout', err);
    }
    window.location.href = `${djangoBase}/accounts/logout/?next=${encodeURIComponent(frontendOrigin)}`;
  };

  const fetchAuthMe = async () => {
    try {
      const response = await djangoFetch(`${apiBase}/auth/me/`);
      const data: AuthMe = await response.json();
      setAuthMe(data);
      setCurrentProfileId(data.profile_id ?? null);
      return data;
    } catch (err) {
      logAppError('fetchAuthMe', err);
      const fallback = { authenticated: false, login_url: `/accounts/google/login/?process=login&next=${encodeURIComponent(frontendOrigin)}` };
      setAuthMe(fallback);
      setCurrentProfileId(null);
      return fallback;
    }
  };

  const fetchMatches = async (profileId: number) => {
    try {
      const response = await djangoFetch(`${apiBase}/profiles/${profileId}/matches/?min_score=60`);
      const data = await response.json();
      setMatches(Array.isArray(data) ? data : []);
    } catch (err) {
      logAppError('fetchMatches', err);
      setError('Failed to load matches.');
    }
  };

  const fetchCurrentProfile = async (profileId: number) => {
    try {
      const response = await djangoFetch(`${apiBase}/profiles/${profileId}/`);
      if (!response.ok) return;
      const data = await response.json();
      setName(data?.display_name || '');
      setTag(data?.tag || '');
      setLinkedinUrl(data?.linkedin_url || '');
      setPinnedLocation(data?.pinned_location || '');
      setPitchTranscript(data?.pitch_text || '');
    } catch (err) {
      logAppError('fetchCurrentProfile', err);
    }
  };

  const fetchMeetups = async () => {
    try {
      const response = await djangoFetch(`${apiBase}/meetups/`);
      const data: any[] = await response.json();
      setMeetups(
        data
          .map((item) => ({
            id: String(item.id),
            title: item.title,
            place: item.place,
            timeText: item.time_text || '',
            meetupDate: item.meetup_date || '',
            meetupTime: item.meetup_time || '',
            upForItCount: item.up_for_it_count || 0,
          }))
          .reverse()
      );
      setExpandedMeetupDays((prev) => {
        const next = { ...prev };
        data.forEach((item) => {
          const key = item.meetup_date || '';
          if (key && !(key in next)) next[key] = true;
        });
        return next;
      });
    } catch (err) {
      logAppError('fetchMeetups', err);
      setMeetupError('Failed to load meetups.');
    }
  };

  const fetchMyMeetups = async (profileId: number) => {
    try {
      const response = await djangoFetch(`${apiBase}/meetups/my/?profile_id=${profileId}`);
      const data = await response.json();
      setMyMeetups(Array.isArray(data) ? data : []);
      setExpandedMeetupDays((prev) => {
        const next = { ...prev };
        (Array.isArray(data) ? data : []).forEach((item) => {
          const key = item.meetup_date || '';
          if (key && !(key in next)) next[key] = true;
        });
        return next;
      });
    } catch (err) {
      logAppError('fetchMyMeetups', err);
    }
  };

  const fetchThreads = async (profileId: number) => {
    try {
      const response = await djangoFetch(`${apiBase}/message-threads/?profile_id=${profileId}`);
      const data = await response.json();
      const list = Array.isArray(data) ? data : [];
      setThreads(list);
      try {
        const stored = JSON.parse(localStorage.getItem(threadReadKey) || '{}');
        const unread: Record<number, boolean> = {};
        list.forEach((thread) => {
          const lastRead = stored[thread.id];
          const updated = thread.updated_at ? new Date(thread.updated_at).getTime() : 0;
          unread[thread.id] = Boolean(updated && (!lastRead || updated > lastRead));
        });
        setThreadUnreadMap(unread);
      } catch {
        setThreadUnreadMap({});
      }
    } catch (err) {
      logAppError('fetchThreads', err);
    }
  };

  const fetchThreadMessages = async (threadId: number, profileId: number) => {
    try {
      const response = await djangoFetch(`${apiBase}/message-threads/${threadId}/messages/?profile_id=${profileId}`);
      const data = await response.json();
      setThreadMessages(Array.isArray(data) ? data : []);
      const thread = threads.find((t) => t.id === threadId);
      const updatedAt = thread?.updated_at ? new Date(thread.updated_at).getTime() : Date.now();
      try {
        const stored = JSON.parse(localStorage.getItem(threadReadKey) || '{}');
        stored[threadId] = updatedAt;
        localStorage.setItem(threadReadKey, JSON.stringify(stored));
      } catch {
        // ignore storage failures
      }
      setThreadUnreadMap((prev) => ({ ...prev, [threadId]: false }));
    } catch (err) {
      logAppError('fetchThreadMessages', err);
      setMessageError('Failed to load messages.');
    }
  };

  const markThreadRead = (threadId: number, updatedAt?: string) => {
    const timeValue = updatedAt ? new Date(updatedAt).getTime() : Date.now();
    try {
      const stored = JSON.parse(localStorage.getItem(threadReadKey) || '{}');
      stored[threadId] = timeValue;
      localStorage.setItem(threadReadKey, JSON.stringify(stored));
    } catch {
      // ignore storage failures
    }
    setThreadUnreadMap((prev) => ({ ...prev, [threadId]: false }));
  };


  useEffect(() => {
    try {
      const raw = window.sessionStorage.getItem(onboardingDraftKey);
      if (!raw) return;
      const draft = JSON.parse(raw);
      setName(draft.name || '');
      setTag(draft.tag || '');
      setLinkedinUrl(draft.linkedinUrl || '');
      setPinnedLocation(draft.pinnedLocation || '');
      setPitchTranscript(draft.pitchTranscript || '');
    } catch (err) {
      logAppError('restoreOnboardingDraft', err);
    }
  }, []);

  useEffect(() => {
    try {
      window.sessionStorage.setItem(
        onboardingDraftKey,
        JSON.stringify({
          name,
          tag,
          linkedinUrl,
          pinnedLocation,
          pitchTranscript,
        })
      );
    } catch (err) {
      logAppError('persistOnboardingDraft', err);
    }
  }, [name, tag, linkedinUrl, pinnedLocation, pitchTranscript]);

  useEffect(() => {
    const init = async () => {
      const auth = await fetchAuthMe();
      await fetchMeetups();
      if (auth.profile_id) {
        await fetchCurrentProfile(auth.profile_id);
        await fetchMatches(auth.profile_id);
        await fetchMyMeetups(auth.profile_id);
        await fetchThreads(auth.profile_id);
      }
    };
    init();
  }, []);

  useEffect(() => {
    if (!currentProfileId) return;
    let socket: WebSocket | null = null;
    let reconnectTimer: number | null = null;

    const connect = () => {
      socket = new WebSocket(`${wsBase}/ws/messages/`);
      setMessageSocketStatus('connecting');

      socket.onopen = () => {
        setMessageSocketStatus('open');
      };

      socket.onmessage = async (event) => {
        try {
          const data = JSON.parse(event.data || '{}');
          if (data?.thread_id) {
            const threadId = Number(data.thread_id);
            setThreads((prev) =>
              prev.map((thread) =>
                thread.id === threadId
                  ? { ...thread, updated_at: data.updated_at || thread.updated_at, last_message: data.message?.body || thread.last_message }
                  : thread
              )
            );
            if (selectedThreadId && String(selectedThreadId) === String(threadId)) {
              if (data.message) {
                setThreadMessages((prev) => {
                  if (prev.some((m) => m.id === data.message.id)) return prev;
                  return [...prev, data.message];
                });
                markThreadRead(threadId, data.updated_at);
              } else {
                await fetchThreadMessages(threadId, currentProfileId);
              }
            } else {
              setThreadUnreadMap((prev) => ({ ...prev, [threadId]: true }));
            }
          }
        } catch (err) {
          logAppError('socket_message', err);
        }
      };

      socket.onclose = () => {
        setMessageSocketStatus('closed');
        if (reconnectTimer) window.clearTimeout(reconnectTimer);
        reconnectTimer = window.setTimeout(connect, 3000);
      };

      socket.onerror = () => {
        socket?.close();
      };
    };

    connect();
    return () => {
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      socket?.close();
    };
  }, [currentProfileId, selectedThreadId]);

  useEffect(() => {
    return () => {
      if (recordingTimerRef.current) window.clearInterval(recordingTimerRef.current);
      recordingStreamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const transcribeAudioFile = async (file: File) => {
    if (!file || file.size === 0) {
      setError('Recorded audio is empty. Please record again.');
      return;
    }
    setIsTranscribing(true);
    setError('');
    try {
      const formData = new FormData();
      formData.append('audio', file);
      const response = await fetch(`${fastApiBase}/stt`, {
        method: 'POST',
        headers: FASTAPI_API_KEY ? { 'X-API-Key': FASTAPI_API_KEY } : undefined,
        body: formData,
      });
      const raw = await response.text();
      let data: any = {};
      try {
        data = raw ? JSON.parse(raw) : {};
      } catch {
        data = { detail: raw };
      }
      if (!response.ok) {
        const detail = data?.detail || data?.hint || raw || 'Unknown error';
        setError(`Transcription failed (${response.status}): ${detail}`);
        logAppError('transcribeAudioFile_non_200', new Error(`HTTP ${response.status}`), data);
        return;
      }
      setPitchTranscript(data.text || '');
    } catch (err) {
      logAppError('transcribeAudioFile', err);
      setError('Failed to transcribe audio. Check FastAPI logs on port 8001.');
    } finally {
      setIsTranscribing(false);
    }
  };

  const stopRecording = () => {
    if (recordingTimerRef.current) {
      window.clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.stop();
    }
  };

  const startRecording = async () => {
    setError('');
    setRecordSeconds(0);
    setPitchTranscript('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      recordingStreamRef.current = stream;
      recordingChunksRef.current = [];
      const preferredTypes = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'];
      const supportedType = preferredTypes.find((type) => MediaRecorder.isTypeSupported(type));
      const options = supportedType ? { mimeType: supportedType } : undefined;
      const recorder = new MediaRecorder(stream, options);
      recorderRef.current = recorder;

      recorder.ondataavailable = (event: BlobEvent) => {
        if (event.data.size > 0) recordingChunksRef.current.push(event.data);
      };

      recorder.onstop = async () => {
        const blobType = recorder.mimeType || 'audio/webm';
        const extension = blobType.includes('ogg') ? 'ogg' : blobType.includes('mp4') ? 'm4a' : 'webm';
        const blob = new Blob(recordingChunksRef.current, { type: blobType });
        if (blob.size === 0) {
          setError('Audio capture failed (empty file). Please record again.');
          setIsRecording(false);
          recordingStreamRef.current?.getTracks().forEach((track) => track.stop());
          recordingStreamRef.current = null;
          return;
        }
        const file = new File([blob], `pitch-${Date.now()}.${extension}`, { type: blobType });
        setAudioFile(file);
        setIsRecording(false);
        recordingStreamRef.current?.getTracks().forEach((track) => track.stop());
        recordingStreamRef.current = null;
        await transcribeAudioFile(file);
      };

      recorder.start();
      setIsRecording(true);
      recordingTimerRef.current = window.setInterval(() => {
        setRecordSeconds((prev) => {
          const next = prev + 1;
          if (next >= 21) {
            stopRecording();
            return 21;
          }
          return next;
        });
      }, 1000);
    } catch (err) {
      logAppError('startRecording', err);
      setError('Microphone permission denied or unavailable.');
    }
  };

  const createProfile = async () => {
    if (!authMe?.authenticated) {
      setError('Sign in with Google first.');
      return;
    }
    if (!name.trim() || !pitchTranscript.trim()) return;

    try {
      const payload = new FormData();
      payload.append('display_name', name.trim());
      payload.append('event_name', 'India AI Summit');
      payload.append('pitch_text', pitchTranscript.trim());
      payload.append('linkedin_url', linkedinUrl.trim());
      payload.append('pinned_location', pinnedLocation.trim());
      payload.append('is_anonymous', 'false');
      payload.append('tag', tag.trim());
      payload.append('location_lat', String(19.1805));
      payload.append('location_lng', String(72.9770));

      const response = await djangoFetch(`${apiBase}/profiles/`, { method: 'POST', body: payload });
      if (!response.ok) {
        const data = await response.json();
        setError(`Failed to create profile: ${JSON.stringify(data)}`);
        return;
      }

      const auth = await fetchAuthMe();
      if (auth.profile_id) {
        await fetchCurrentProfile(auth.profile_id);
        try {
          window.sessionStorage.removeItem(onboardingDraftKey);
        } catch (err) {
          logAppError('clearOnboardingDraft', err);
        }
        await fetchMatches(auth.profile_id);
        await fetchMyMeetups(auth.profile_id);
        await fetchThreads(auth.profile_id);
        setPage('matches');
      }
    } catch (err) {
      logAppError('createProfile', err);
      setError('Failed to create profile.');
    }
  };

  const updateProfile = async () => {
    if (!currentProfileId) return;
    try {
      const payload = new FormData();
      payload.append('is_anonymous', 'false');
      payload.append('linkedin_url', linkedinUrl.trim());
      payload.append('pinned_location', pinnedLocation.trim());
      payload.append('tag', tag.trim());

      const response = await djangoFetch(`${apiBase}/profiles/${currentProfileId}/`, { method: 'PATCH', body: payload });
      if (!response.ok) {
        const data = await response.json();
        setError(`Failed to update profile: ${JSON.stringify(data)}`);
        return;
      }
      const auth = await fetchAuthMe();
      if (auth.profile_id) await fetchMatches(auth.profile_id);
    } catch (err) {
      logAppError('updateProfile', err);
      setError('Failed to update profile.');
    }
  };

  const planMeetup = async () => {
    if (!currentProfileId) {
      setMeetupError('Create profile first.');
      return;
    }
    if (!meetupTitle.trim() || !meetupPlace.trim() || !meetupDate || !meetupTime) {
      setMeetupError('Add title, place, date, and time.');
      return;
    }
    try {
      const response = await djangoFetch(`${apiBase}/meetups/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: meetupTitle.trim(),
          place: meetupPlace.trim(),
          meetup_date: meetupDate,
          meetup_time: meetupTime,
          time_text: meetupTime,
          organizer: currentProfileId,
          event_name: 'India AI Summit',
        }),
      });
      if (!response.ok) {
        setMeetupError('Failed to plan meetup.');
        return;
      }
      setMeetupTitle('');
      setMeetupPlace('');
      setMeetupDate(todayDate());
      setMeetupTime('11:00');
      await fetchMeetups();
      await fetchMyMeetups(currentProfileId);
    } catch (err) {
      logAppError('planMeetup', err);
      setMeetupError('Failed to plan meetup.');
    }
  };

  const toggleUpForIt = async (meetupId: string) => {
    if (!currentProfileId) return;
    try {
      await djangoFetch(`${apiBase}/meetups/${meetupId}/up_for_it/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profile_id: currentProfileId }),
      });
      await fetchMeetups();
      await fetchMyMeetups(currentProfileId);
    } catch (err) {
      logAppError('toggleUpForIt', err);
    }
  };

  const startThread = async (recipientProfileId: number) => {
    if (!currentProfileId) return;
    const text = window.prompt('Write your first message', 'Hi, would like to connect.');
    if (!text) return;
    try {
      const response = await djangoFetch(`${apiBase}/message-threads/start/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sender_profile_id: currentProfileId,
          recipient_profile_id: recipientProfileId,
          text,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        setMessageError(data.error || 'Unable to start conversation.');
        return;
      }
      setPage('messages');
      await fetchThreads(currentProfileId);
      setSelectedThreadId(data.thread_id);
      await fetchThreadMessages(data.thread_id, currentProfileId);
    } catch (err) {
      logAppError('startThread', err);
      setMessageError('Unable to start conversation.');
    }
  };

  const sendMessage = async () => {
    if (!selectedThreadId || !currentProfileId || !newMessageText.trim()) return;
    try {
      const response = await djangoFetch(`${apiBase}/message-threads/${selectedThreadId}/send/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sender_profile_id: currentProfileId, text: newMessageText.trim() }),
      });
      const data = await response.json();
      if (!response.ok) {
        setMessageError(data.error || 'Failed to send message.');
        return;
      }
      setNewMessageText('');
      await fetchThreadMessages(selectedThreadId, currentProfileId);
      await fetchThreads(currentProfileId);
    } catch (err) {
      logAppError('sendMessage', err);
    }
  };

  const hasProfile = Boolean(currentProfileId);
  const canStartSignInFlow = Boolean(name.trim() && pitchTranscript.trim() && !isTranscribing);
  const handlePrimaryAction = async () => {
    if (!canStartSignInFlow) return;
    if (!authMe?.authenticated) {
      window.location.href = loginUrl;
      return;
    }
    await createProfile();
  };

  useEffect(() => {
    if (!authMe?.authenticated) return;
    if (currentProfileId) return;
    if (onboardingMode !== 'create') return;
    if (!canStartSignInFlow) return;
    if (autoCreateAttemptedRef.current) return;
    autoCreateAttemptedRef.current = true;
    createProfile();
  }, [authMe?.authenticated, currentProfileId, canStartSignInFlow, onboardingMode]);

  useEffect(() => {
    if (page !== 'profile' || !currentProfileId) return;
    fetchCurrentProfile(currentProfileId);
  }, [page, currentProfileId]);

  return (
    <div className="min-h-screen bg-white text-neutral-900">
      <header className="mx-auto max-w-5xl px-6 pt-14 pb-8">
        <p className="text-xs uppercase tracking-[0.2em] text-neutral-500">
          India AI Summit | <span className="text-blue-600">MEETATEVENT.COM</span>
        </p>
        <h1 className="mt-4 max-w-3xl font-display text-4xl leading-tight text-neutral-950 md:text-5xl">
          Expo networking, without noise.
        </h1>
      </header>

      <main className="mx-auto max-w-5xl px-6 pb-16">
        {!hasProfile ? (
          onboardingMode === 'choice' ? (
            <section className="grid gap-4 md:grid-cols-2">
              <article className="rounded-2xl border border-neutral-200 p-6">
                <h2 className="font-display text-2xl text-neutral-900">Why this exists</h2>
                <p className="mt-2 text-sm text-neutral-600">
                  Large expo venues are chaotic. This platform helps attendees find relevant people quickly, plan focused meetups, and message only meaningful matches.
                </p>
                <div className="mt-4 space-y-2">
                  {carouselItems.map((feature) => (
                    <div key={feature.label} className="flex items-center gap-2 rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm text-neutral-700">
                      <Glyph path={feature.icon} className="h-4 w-4 text-neutral-700" />
                      <span>{feature.label}</span>
                    </div>
                  ))}
                </div>
              </article>

              <article className="rounded-2xl border border-neutral-200 p-6">
                <h2 className="font-display text-2xl text-neutral-900">Get started</h2>
                <p className="mt-2 text-sm text-neutral-600">Use Google identity to sign in or create a new profile.</p>
                {authMe?.authenticated ? (
                  <p className="mt-2 text-xs text-neutral-500">Signed in as {authMe.name || authMe.email}</p>
                ) : null}

                <div className="mt-6 grid gap-3">
                  <button
                    className="rounded-xl border border-neutral-300 px-4 py-3 text-left text-sm disabled:opacity-40"
                    onClick={async () => {
                      if (authMe?.authenticated) return;
                      window.location.href = loginUrl;
                    }}
                  >
                    Sign in with an existing account
                  </button>
                  <button
                    className="rounded-xl border border-neutral-900 bg-neutral-900 px-4 py-3 text-left text-sm text-white disabled:opacity-40"
                    onClick={async () => {
                      setOnboardingMode('create');
                    }}
                  >
                    Sign up to create new account
                  </button>
                </div>
              </article>
            </section>
          ) : (
            <section className="mx-auto max-w-2xl rounded-2xl border border-neutral-200 p-6">
              <h2 className="font-display text-2xl text-neutral-900">Create your profile</h2>
              <p className="mt-2 text-sm text-neutral-600">Record your Elevator Pitch &gt; Sign-in with Google &gt; Profile ready</p>

              {authMe?.authenticated ? (
                <p className="mt-3 text-xs text-neutral-500">Signed in as {authMe.name || authMe.email}</p>
              ) : null}

              <div className="mt-4 grid gap-4">
                <label className="text-xs uppercase tracking-[0.2em] text-neutral-500">
                  Name
                  <input className="mt-2 w-full rounded-xl border border-neutral-200 px-3 py-2 text-sm" value={name} onChange={(e) => setName(e.target.value)} />
                </label>
                <label className="text-xs uppercase tracking-[0.2em] text-neutral-500">
                  Role
                  <input className="mt-2 w-full rounded-xl border border-neutral-200 px-3 py-2 text-sm" value={tag} onChange={(e) => setTag(e.target.value)} placeholder="Founder, Buyer, Engineer..." />
                </label>
              </div>

              <div className="mt-4 rounded-2xl border border-neutral-200 bg-neutral-50 p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-neutral-500">Pitch tips</p>
                <div className="mt-3 grid gap-2">
                  <p className="rounded-xl bg-white px-3 py-2 text-sm text-neutral-700"><span className="font-medium text-neutral-900">Say:</span> why you are here, your expertise, and who you want to meet.</p>
                  <p className="rounded-xl bg-white px-3 py-2 text-sm text-neutral-700"><span className="font-medium text-neutral-900">Keep it:</span> specific and practical.</p>
                  <p className="rounded-xl bg-white px-3 py-2 text-sm text-neutral-700"><span className="font-medium text-neutral-900">Avoid:</span> buzzwords and generic claims.</p>
                </div>
              </div>

              <div className="mt-4 rounded-xl border border-neutral-200 p-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs uppercase tracking-[0.2em] text-neutral-900">Voice pitch (21 secs only)</p>
                  <div className="flex items-center gap-2">
                    <span className="group relative inline-flex">
                      <button
                        type="button"
                        aria-label="Why 21 seconds?"
                        className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-neutral-300 text-[11px] text-neutral-600"
                      >
                        ?
                      </button>
                      <span className="pointer-events-none absolute right-0 top-7 z-20 hidden w-64 rounded-lg border border-neutral-200 bg-white p-2 text-[11px] leading-relaxed text-neutral-600 shadow-sm group-hover:block group-focus-within:block">
                        Why 21 secs? Your match brings the other 21. 21 + 21 = 42 — the answer to everything.
                      </span>
                    </span>
                    <span className="group relative inline-flex">
                      <button
                        type="button"
                        aria-label="Pitch is final"
                        className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-neutral-300 text-[11px] text-neutral-600"
                      >
                        i
                      </button>
                      <span className="pointer-events-none absolute right-0 top-7 z-20 hidden w-72 rounded-lg border border-neutral-200 bg-white p-2 text-[11px] leading-relaxed text-neutral-600 shadow-sm group-hover:block group-focus-within:block">
                        Once submitted, you can’t change the pitch. Please check the transcript carefully — it’s used for matching.
                      </span>
                    </span>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <button className="rounded-full bg-neutral-900 px-4 py-2 text-xs text-white disabled:opacity-40" onClick={startRecording} disabled={isRecording}>
                    {isRecording ? 'Recording...' : 'Record your Elevator Pitch'}
                  </button>
                  <button className="rounded-full border border-neutral-300 px-4 py-2 text-xs disabled:opacity-40" onClick={stopRecording} disabled={!isRecording}>
                    Stop
                  </button>
                  <span className="text-xs text-neutral-500">{recordSeconds}s / 21s</span>
                  {isTranscribing ? <span className="text-xs text-neutral-500">Auto-transcribing...</span> : null}
                </div>
                <textarea className="mt-4 h-24 w-full rounded-xl border border-neutral-200 px-3 py-2 text-sm" value={pitchTranscript} readOnly placeholder="Transcript appears automatically after recording stops" />
              </div>

              <div className="mt-6 flex flex-wrap items-center gap-3">
                <button className="rounded-full border border-neutral-300 px-4 py-2 text-xs" onClick={() => setOnboardingMode('choice')}>
                  Back
                </button>
                {!authMe?.authenticated ? (
                  <button
                    className="inline-flex items-center gap-3 rounded-full border border-neutral-300 bg-white px-5 py-2.5 text-sm text-neutral-900 shadow-sm disabled:opacity-40"
                    disabled={!canStartSignInFlow}
                    onClick={handlePrimaryAction}
                  >
                    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
                      <path fill="#EA4335" d="M24 9.5c3.2 0 6.1 1.1 8.3 3.2l6.2-6.2C34.8 3.1 29.8 1 24 1 14.8 1 6.9 6.3 3 13.9l7.4 5.8C12.2 13.5 17.6 9.5 24 9.5z" />
                      <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-2.8-.4-4.1H24v8h12.7c-.3 2-1.6 5-4.5 7l6.9 5.3c4.1-3.8 6.4-9.4 6.4-16.2z" />
                      <path fill="#FBBC05" d="M10.4 28.3c-.5-1.5-.8-3-.8-4.8 0-1.7.3-3.3.8-4.8L3 13.9C1.7 16.6 1 20.2 1 24s.7 7.4 2 10.1l7.4-5.8z" />
                      <path fill="#34A853" d="M24 47c6.5 0 11.9-2.1 15.9-5.8l-6.9-5.3c-1.9 1.3-4.5 2.2-9 2.2-6.4 0-11.8-4-13.7-10l-7.4 5.8C6.9 41.7 14.8 47 24 47z" />
                    </svg>
                    <span>Sign-in with Google</span>
                  </button>
                ) : (
                  <button className="rounded-full bg-neutral-900 px-6 py-2.5 text-sm text-white disabled:opacity-40" disabled={!canStartSignInFlow} onClick={handlePrimaryAction}>
                    Create profile
                  </button>
                )}
              </div>

              {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
            </section>
          )
        ) : (
          <div className="space-y-8">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap gap-2">
                {([
                  ['matches', 'Matches'],
                  ['myMeetups', 'My Meetups'],
                  ['messages', 'Messages'],
                  ['profile', 'Profile'],
                ] as Array<[Page, string]>).map(([id, label]) => (
                  <button
                    key={id}
                    className={`rounded-full px-4 py-2 text-sm ${page === id ? 'bg-neutral-900 text-white' : 'border border-neutral-300'}`}
                    onClick={() => setPage(id)}
                  >
                    {label}
                    {id === 'messages' && Object.values(threadUnreadMap).some(Boolean) ? (
                      <span className="ml-2 inline-flex h-2 w-2 rounded-full bg-red-500" />
                    ) : null}
                  </button>
                ))}
              </div>
              <button onClick={handleLogout} className="rounded-full border border-neutral-300 px-4 py-2 text-sm">
                Logout
              </button>
            </div>

            {page === 'matches' ? (
              <section className="rounded-2xl border border-neutral-200 p-6">
                <h2 className="font-display text-2xl text-neutral-900">Matches</h2>
                <div className="mt-6 space-y-3">
                  {matches.map((match) => (
                    <article key={match.profile_id} className="rounded-xl border border-neutral-200 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-medium text-neutral-900">Matched attendee</p>
                          <p className="text-xs text-neutral-500">{match.tag}</p>
                          {match.pinned_location ? <p className="text-xs text-neutral-500">Pinned: {match.pinned_location}</p> : null}
                        </div>
                        <span className="text-sm text-neutral-500">{match.match_score}%</span>
                      </div>
                      <p className="mt-2 text-sm text-neutral-600">{match.pitch_text || 'Voice profile hidden until messaging threshold is met.'}</p>
                      <p className="mt-1 text-xs text-neutral-500">{match.reasoning}</p>
                      <div className="mt-3 flex gap-2">
                        <button className="rounded-full border border-neutral-300 px-4 py-2 text-xs" onClick={() => startThread(match.profile_id)}>
                          Message
                        </button>
                        {match.linkedin_url ? (
                          <a className="rounded-full border border-neutral-300 px-4 py-2 text-xs" href={match.linkedin_url} target="_blank" rel="noreferrer">
                            LinkedIn
                          </a>
                        ) : null}
                      </div>
                    </article>
                  ))}
                  {matches.length === 0 ? <p className="text-sm text-neutral-500">No matches above 60% yet.</p> : null}
                </div>
              </section>
            ) : null}

            {page === 'myMeetups' ? (
              <section className="rounded-2xl border border-neutral-200 p-6">
                <h2 className="font-display text-2xl text-neutral-900">Plan a Meetup</h2>
                <div className="mt-6 grid gap-3 md:grid-cols-4">
                  <input className="rounded-xl border border-neutral-200 px-3 py-2 text-sm" placeholder="Meetup title" value={meetupTitle} onChange={(e) => setMeetupTitle(e.target.value)} />
                  <input className="rounded-xl border border-neutral-200 px-3 py-2 text-sm" placeholder="Place" value={meetupPlace} onChange={(e) => setMeetupPlace(e.target.value)} />
                  <input className="rounded-xl border border-neutral-200 px-3 py-2 text-sm" type="date" value={meetupDate} onChange={(e) => setMeetupDate(e.target.value)} />
                  <input className="rounded-xl border border-neutral-200 px-3 py-2 text-sm" type="time" value={meetupTime} onChange={(e) => setMeetupTime(e.target.value)} />
                </div>
                <button className="mt-4 rounded-full bg-neutral-900 px-5 py-2.5 text-sm text-white" onClick={planMeetup}>
                  Organize
                </button>
                {meetupError ? <p className="mt-3 text-sm text-red-600">{meetupError}</p> : null}

                <h3 className="mt-8 text-sm font-medium text-neutral-900">All meetups</h3>
                <div className="mt-3 space-y-4">
                  {Object.entries(
                    meetups.reduce<Record<string, Meetup[]>>((acc, event) => {
                      const key = event.meetupDate || 'Unknown date';
                      acc[key] = acc[key] || [];
                      acc[key].push(event);
                      return acc;
                    }, {})
                  ).map(([dateKey, items]) => {
                    const expanded = expandedMeetupDays[dateKey] ?? true;
                    return (
                      <div key={dateKey} className="rounded-xl border border-neutral-200">
                        <button
                          className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-medium text-neutral-900"
                          onClick={() => setExpandedMeetupDays((prev) => ({ ...prev, [dateKey]: !expanded }))}
                        >
                          <span>{formatMeetupDay(dateKey)}</span>
                          <span className="text-xs text-neutral-500">{expanded ? 'Collapse' : 'Expand'}</span>
                        </button>
                        {expanded ? (
                          <div className="space-y-3 border-t border-neutral-200 p-4">
                            {items.map((event) => {
                              const isSelected = myMeetups.some((m) => String(m.id) === String(event.id));
                              return (
                                <article key={event.id} className={`rounded-xl border p-4 ${isSelected ? 'border-emerald-200 bg-emerald-50' : 'border-neutral-200'}`}>
                                  <div className="flex items-center justify-between gap-2">
                                    <p className="text-sm font-medium text-neutral-900">{event.title}</p>
                                    <p className="text-xs text-neutral-500">{formatMeetupDateTime(event.meetupDate, event.meetupTime || event.timeText)}</p>
                                  </div>
                                  <p className="mt-1 text-sm text-neutral-600">{event.place}</p>
                                  <div className="mt-3 flex items-center gap-3">
                                    <button className="rounded-full border border-neutral-300 px-4 py-2 text-xs" onClick={() => toggleUpForIt(event.id)}>
                                      I'm up for it
                                    </button>
                                    <span className="text-xs text-neutral-500">{event.upForItCount} persons might attend this</span>
                                  </div>
                                </article>
                              );
                            })}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>

                <h3 className="mt-8 text-sm font-medium text-neutral-900">My meetups</h3>
                <div className="mt-3 space-y-4">
                  {Object.entries(
                    myMeetups.reduce<Record<string, MyMeetup[]>>((acc, meetup) => {
                      const key = meetup.meetup_date || 'Unknown date';
                      acc[key] = acc[key] || [];
                      acc[key].push(meetup);
                      return acc;
                    }, {})
                  ).map(([dateKey, items]) => {
                    const expanded = expandedMeetupDays[dateKey] ?? true;
                    return (
                      <div key={dateKey} className="rounded-xl border border-neutral-200">
                        <button
                          className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-medium text-neutral-900"
                          onClick={() => setExpandedMeetupDays((prev) => ({ ...prev, [dateKey]: !expanded }))}
                        >
                          <span>{formatMeetupDay(dateKey)}</span>
                          <span className="text-xs text-neutral-500">{expanded ? 'Collapse' : 'Expand'}</span>
                        </button>
                        {expanded ? (
                          <div className="space-y-3 border-t border-neutral-200 p-4">
                            {items.map((meetup) => (
                              <article key={meetup.id} className="rounded-xl border border-neutral-200 p-4">
                                <div className="flex items-center justify-between gap-2">
                                  <p className="text-sm font-medium text-neutral-900">{meetup.title}</p>
                                  <span className={`rounded-full px-3 py-1 text-xs ${meetup.role === 'Organizer' ? 'bg-neutral-900 text-white' : 'border border-neutral-300'}`}>
                                    {meetup.role}
                                  </span>
                                </div>
                                <p className="mt-1 text-sm text-neutral-600">{meetup.place}</p>
                                <p className="mt-1 text-xs text-neutral-500">{formatMeetupDateTime(meetup.meetup_date, meetup.meetup_time || meetup.time_text)}</p>
                              </article>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                  {myMeetups.length === 0 ? <p className="text-sm text-neutral-500">No organizer/participant meetups yet.</p> : null}
                </div>
              </section>
            ) : null}

            {page === 'messages' ? (
              <section className="grid gap-4 md:grid-cols-[0.9fr_1.1fr]">
                <div className="rounded-2xl border border-neutral-200 p-4">
                  <h2 className="font-display text-xl text-neutral-900">Threads</h2>
                  <div className="mt-4 space-y-2">
                    {threads.map((thread) => {
                      const peer = thread.participants.find((p) => p.id !== currentProfileId);
                      const peerRole = peer?.tag?.trim() || '';
                      const hasUnread = threadUnreadMap[thread.id];
                      return (
                        <button
                          key={thread.id}
                          className={`w-full rounded-xl border px-3 py-3 text-left ${selectedThreadId === thread.id ? 'border-neutral-900' : 'border-neutral-200'}`}
                          onClick={async () => {
                            setSelectedThreadId(thread.id);
                            if (currentProfileId) await fetchThreadMessages(thread.id, currentProfileId);
                          }}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-sm font-medium text-neutral-900">{peerRole || 'Matched attendee'}</p>
                            {hasUnread ? <span className="inline-flex h-2 w-2 rounded-full bg-red-500" /> : null}
                          </div>
                          <p className="mt-1 truncate text-xs text-neutral-500">{thread.last_message || 'No messages yet'}</p>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="rounded-2xl border border-neutral-200 p-4">
                  <h2 className="font-display text-xl text-neutral-900">Conversation</h2>
                  <div className="mt-4 h-80 space-y-2 overflow-y-auto rounded-xl border border-neutral-200 p-3">
                    {threadMessages.map((msg) => (
                      <div key={msg.id} className={`max-w-[80%] rounded-xl px-3 py-2 text-sm ${msg.sender === currentProfileId ? 'ml-auto bg-neutral-900 text-white' : 'bg-neutral-100 text-neutral-900'}`}>
                        <p className="text-[11px] opacity-70">
                          {msg.sender === currentProfileId ? 'You' : (msg.sender_role?.trim() || 'Matched attendee')}
                        </p>
                        <p>{msg.body}</p>
                        <p className="mt-1 text-[10px] opacity-70">{formatMessageDateTime(msg.created_at)}</p>
                      </div>
                    ))}
                    {threadMessages.length === 0 ? <p className="text-sm text-neutral-500">Select a thread to view messages.</p> : null}
                  </div>
                  <div className="mt-3 flex gap-2">
                    <input className="flex-1 rounded-xl border border-neutral-200 px-3 py-2 text-sm" value={newMessageText} onChange={(e) => setNewMessageText(e.target.value)} />
                    <button className="rounded-xl bg-neutral-900 px-4 py-2 text-sm text-white" onClick={sendMessage}>Send</button>
                  </div>
                  {messageError ? <p className="mt-2 text-sm text-red-600">{messageError}</p> : null}
                </div>
              </section>
            ) : null}

            {page === 'profile' ? (
              <section className="rounded-2xl border border-neutral-200 p-6">
                <h2 className="font-display text-2xl text-neutral-900">Profile</h2>
                <div className="mt-6 grid gap-4 md:grid-cols-2">
                  <label className="text-xs uppercase tracking-[0.2em] text-neutral-500">
                    Role
                    <input className="mt-2 w-full rounded-xl border border-neutral-200 px-3 py-2 text-sm" value={tag} onChange={(e) => setTag(e.target.value)} />
                  </label>
                </div>
                <div className="mt-6 rounded-xl border border-neutral-200 p-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-neutral-500">Voice transcript (read-only)</p>
                  <textarea
                    className="mt-3 h-24 w-full rounded-xl border border-neutral-200 px-3 py-2 text-sm"
                    value={pitchTranscript}
                    readOnly
                    placeholder="No transcript available yet."
                  />
                </div>

                <button className="mt-5 rounded-full bg-neutral-900 px-5 py-2.5 text-sm text-white" onClick={updateProfile}>Save profile</button>
                {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
              </section>
            ) : null}
          </div>
        )}
      </main>
      <footer className="mx-auto max-w-5xl px-6 pb-10">
        <p className="text-xs text-neutral-500">
          Disclaimer: This platform is NOT officially associated with India AI Summit. It is a hobby project built to solve a problem of networking at events. Pls don't share any personal information over messages. Connect with your matches via the platform and then take over the discussion in-person. This is designed to protect your privacy.
        </p>
      </footer>
    </div>
  );
}
