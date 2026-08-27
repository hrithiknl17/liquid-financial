import { BriefKind, Settings } from '../types';
import { todayISO } from './dates';
import { load, save } from './storage';

/**
 * Two layers, because no single one is reliable everywhere:
 *
 *  1. In-app briefs — computed on open, always work, no permissions.
 *  2. OS notifications — fired by a timer while a tab is open, and by the
 *     service worker's Periodic Background Sync where the browser supports it
 *     (installed PWA on Chrome/Android). iOS and desktop without a push server
 *     fall back to layer 1.
 */

const SEEN_KEY = 'briefs_seen';

type SeenMap = Partial<Record<BriefKind, string>>;

export function markBriefSeen(kind: BriefKind): void {
  const seen = load<SeenMap>(SEEN_KEY, {});
  save(SEEN_KEY, { ...seen, [kind]: todayISO() });
}

export function briefSeenOn(kind: BriefKind): string | undefined {
  return load<SeenMap>(SEEN_KEY, {})[kind];
}

function minutesNow(): number {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}

function parseTime(value: string, fallback: number): number {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value ?? '');
  if (!match) return fallback;
  const hours = Number(match[1]);
  const mins = Number(match[2]);
  if (hours > 23 || mins > 59) return fallback;
  return hours * 60 + mins;
}

/**
 * Which brief the Hub should surface right now, if any.
 * Weekly wins over the daily pair on review day.
 */
export function dueBrief(settings: Settings): BriefKind | null {
  const today = todayISO();
  const now = minutesNow();
  const morning = parseTime(settings.morningBriefTime, 8 * 60);
  const evening = parseTime(settings.eveningNudgeTime, 20 * 60 + 30);

  const isReviewDay = new Date().getDay() === settings.weeklyReviewDay;
  if (isReviewDay && now >= evening && briefSeenOn('weekly') !== today) return 'weekly';
  if (now >= evening && briefSeenOn('evening') !== today) return 'evening';
  if (now >= morning && now < evening && briefSeenOn('morning') !== today) return 'morning';
  return null;
}

/* ===================== OS NOTIFICATIONS ===================== */

export function notificationsSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export function notificationPermission(): NotificationPermission | 'unsupported' {
  return notificationsSupported() ? Notification.permission : 'unsupported';
}

export async function requestNotificationPermission(): Promise<NotificationPermission | 'unsupported'> {
  if (!notificationsSupported()) return 'unsupported';
  if (Notification.permission !== 'default') return Notification.permission;
  return Notification.requestPermission();
}

async function show(title: string, body: string, tag: string): Promise<void> {
  if (notificationPermission() !== 'granted') return;
  const registration = await navigator.serviceWorker?.getRegistration();
  const options: NotificationOptions = {
    body,
    tag,
    icon: '/icon.svg',
    badge: '/icon.svg',
    data: { url: '/' },
  };
  if (registration) await registration.showNotification(title, options);
  else new Notification(title, options);
}

let timers: number[] = [];

function clearTimers(): void {
  timers.forEach((id) => window.clearTimeout(id));
  timers = [];
}

/**
 * Arms today's remaining reminders for as long as this tab lives.
 * Re-arm whenever the reminder settings change.
 */
export function scheduleTodaysReminders(settings: Settings): void {
  clearTimers();
  if (!settings.remindersEnabled || notificationPermission() !== 'granted') return;

  const now = minutesNow();
  const plan: { at: number; kind: BriefKind; title: string; body: string }[] = [
    {
      at: parseTime(settings.morningBriefTime, 8 * 60),
      kind: 'morning',
      title: 'Your morning brief',
      body: 'Yesterday’s spend, what’s safe to spend today, and what renews soon.',
    },
    {
      at: parseTime(settings.eveningNudgeTime, 20 * 60 + 30),
      kind: 'evening',
      title: 'How did today go?',
      body: 'Log what you spent before you forget. Takes ten seconds.',
    },
  ];

  const today = todayISO();
  for (const entry of plan) {
    if (entry.at <= now) continue;
    if (briefSeenOn(entry.kind) === today) continue;
    const delayMs = (entry.at - now) * 60_000;
    // setTimeout caps out around 24 days; a same-day delay is always safe.
    timers.push(window.setTimeout(() => void show(entry.title, entry.body, `brief-${entry.kind}`), delayMs));
  }
}

/**
 * Asks the browser for background wake-ups so reminders fire when the app is
 * closed. Only Chromium honours this, and only for an installed PWA.
 */
export async function registerBackgroundReminders(settings: Settings): Promise<boolean> {
  if (!('serviceWorker' in navigator)) return false;
  const registration = (await navigator.serviceWorker.ready.catch(() => null)) as
    | (ServiceWorkerRegistration & { periodicSync?: { register(tag: string, options: { minInterval: number }): Promise<void> } })
    | null;
  if (!registration?.periodicSync) return false;

  try {
    const status = await navigator.permissions?.query({
      name: 'periodic-background-sync' as PermissionName,
    });
    if (status && status.state !== 'granted') return false;

    await registration.periodicSync.register('liquid-daily-nudge', { minInterval: 12 * 60 * 60 * 1000 });
    registration.active?.postMessage({
      type: 'reminder-settings',
      morning: settings.morningBriefTime,
      evening: settings.eveningNudgeTime,
      enabled: settings.remindersEnabled,
    });
    return true;
  } catch {
    return false;
  }
}

export function reminderCapability(): 'background' | 'foreground' | 'unavailable' {
  if (!notificationsSupported()) return 'unavailable';
  const canBackground =
    'serviceWorker' in navigator && 'PeriodicSyncManager' in window && window.matchMedia('(display-mode: standalone)').matches;
  return canBackground ? 'background' : 'foreground';
}
