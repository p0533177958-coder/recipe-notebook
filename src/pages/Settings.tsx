import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { IconCheck, IconDownload, IconUpload } from '../components/Icons';
import { Button, PageHeader, toast } from '../components/ui';
import { AI_STUDIO_URL, MAX_COOK_FONT, MIN_COOK_FONT } from '../config';
import { backupFileName, downloadBlob, exportBackup, importFromText } from '../lib/backup';
import { FONT_STYLES, loadAllFontStyles, type FontStyleId } from '../lib/fonts';
import { AiError, checkApiKey } from '../lib/gemini';
import { checkForUpdate } from '../lib/updates';
import { playChime, unlockAudio } from '../lib/sound';
import { speak } from '../lib/speech';
import { restoreSamples } from '../seed';
import { updateSettings, useSettings, type ListView, type ThemeMode } from '../settings';
import { S } from '../strings.he';

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mb-5 rounded-card border border-line bg-surface p-4 shadow-soft">
      <h2 className="mb-3 text-lg font-bold text-primary">{title}</h2>
      <div className="flex flex-col gap-4">{children}</div>
    </section>
  );
}

function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div>
      <p className="mb-1.5 font-medium">{label}</p>
      <div className="flex rounded-2xl bg-surface-2 p-1" role="radiogroup" aria-label={label}>
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={value === o.value}
            onClick={() => onChange(o.value)}
            className={`min-h-11 flex-1 rounded-xl px-2 transition ${
              value === o.value ? 'bg-surface font-bold text-primary shadow-soft' : 'text-muted'
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex min-h-12 cursor-pointer items-center justify-between gap-3">
      <span className="font-medium">{label}</span>
      <input type="checkbox" className="peer sr-only" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span
        aria-hidden="true"
        className="relative h-8 w-14 shrink-0 rounded-full bg-line transition peer-checked:bg-secondary peer-focus-visible:ring-2 peer-focus-visible:ring-primary after:absolute after:top-1 after:right-1 after:size-6 after:rounded-full after:bg-white after:shadow after:transition peer-checked:after:-translate-x-6"
      />
    </label>
  );
}

const builtAt = new Date(__BUILD_TIME__).toLocaleString('he-IL', {
  day: 'numeric',
  month: 'numeric',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

/** Shows which version is running and checks for a newer one on demand. */
function UpdateCheck() {
  const [busy, setBusy] = useState(false);
  const check = async () => {
    if (!navigator.onLine) {
      toast(S.update.offline);
      return;
    }
    setBusy(true);
    const found = await checkForUpdate();
    setBusy(false);
    // When found, the app reloads by itself as soon as the new version is installed.
    toast(found ? S.update.found : S.update.upToDate);
  };
  return (
    <div className="mt-3 flex flex-col items-center gap-2 pb-4">
      <p className="text-sm text-muted">{S.update.builtAt(builtAt)}</p>
      <Button variant="secondary" onClick={() => void check()} disabled={busy}>
        {busy ? S.update.checking : S.update.checkNow}
      </Button>
    </div>
  );
}

/** One card per font style, each previewed in its own fonts. */
function FontPicker({ value, onChange }: { value: FontStyleId; onChange: (v: FontStyleId) => void }) {
  useEffect(() => loadAllFontStyles(), []);
  return (
    <div>
      <p className="mb-1.5 font-medium">{S.settings.font}</p>
      <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label={S.settings.font}>
        {FONT_STYLES.map((f) => {
          const on = value === f.id;
          return (
            <button
              key={f.id}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => onChange(f.id)}
              className={`flex min-h-28 flex-col items-start gap-1 rounded-2xl border-2 p-3 text-start transition active:scale-[0.98] ${
                on ? 'border-primary bg-primary/5' : 'border-line bg-bg'
              }`}
            >
              <span className="flex w-full items-center gap-1 text-sm text-muted">
                <span className="flex-1">{f.name}</span>
                {on && <IconCheck size={16} className="text-primary" />}
              </span>
              <span
                className="text-xl leading-tight text-ink"
                style={{ fontFamily: `${f.title}, 'Rubik', serif`, fontWeight: f.titleWeight }}
              >
                {S.settings.fontSampleTitle}
              </span>
              <span className="text-sm leading-snug text-muted" style={{ fontFamily: `${f.ui}, 'Rubik', sans-serif` }}>
                {S.settings.fontSampleText}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function notificationState(): 'on' | 'off' | 'denied' | 'unsupported' {
  if (!('Notification' in window)) return 'unsupported';
  if (Notification.permission === 'granted') return 'on';
  if (Notification.permission === 'denied') return 'denied';
  return 'off';
}

export default function Settings() {
  const s = useSettings();
  const navigate = useNavigate();
  const [key, setKey] = useState(s.apiKey);
  const [showKey, setShowKey] = useState(false);
  const [keyStatus, setKeyStatus] = useState<{ ok: boolean; text: string; detail?: string } | null>(null);
  const [checking, setChecking] = useState(false);
  const [notif, setNotif] = useState(notificationState);
  const importRef = useRef<HTMLInputElement>(null);

  const saveKey = (v: string) => {
    setKey(v);
    setKeyStatus(null);
    updateSettings({ apiKey: v.trim() });
  };

  const onCheck = async () => {
    setChecking(true);
    setKeyStatus(null);
    try {
      const model = await checkApiKey(key);
      setKeyStatus({ ok: true, text: S.settings.keyOk, detail: model });
    } catch (e) {
      const code = e instanceof AiError ? e.code : 'server';
      const detail = e instanceof AiError ? e.detail : String(e);
      setKeyStatus({ ok: false, text: S.errors[code] ?? S.errors.generic, detail });
    } finally {
      setChecking(false);
    }
  };

  const onExport = async () => {
    downloadBlob(await exportBackup(), backupFileName());
  };

  const onImport = async (files: FileList | null) => {
    const f = files?.[0];
    if (!f) return;
    const res = await importFromText(await f.text());
    toast(res ? S.settings.importDone(res.added, res.skipped) : S.errors.importFailed);
  };

  return (
    <div className="mx-auto min-h-dvh max-w-2xl pb-16">
      <PageHeader title={S.settings.title} onBack={() => navigate('/')} />
      <div className="px-4">
        <Section title={S.settings.aiSection}>
          <div>
            <label htmlFor="apikey" className="mb-1.5 block font-medium">
              {S.settings.apiKey}
            </label>
            <div className="flex gap-2">
              <input
                id="apikey"
                type={showKey ? 'text' : 'password'}
                dir="ltr"
                autoComplete="off"
                spellCheck={false}
                value={key}
                onChange={(e) => saveKey(e.target.value)}
                placeholder={S.settings.apiKeyPlaceholder}
                className="min-h-12 min-w-0 flex-1 rounded-xl border border-line bg-bg px-3 font-mono text-sm outline-none focus:border-primary"
              />
              <Button variant="secondary" className="px-3!" onClick={() => setShowKey((v) => !v)}>
                {showKey ? S.settings.hideKey : S.settings.showKey}
              </Button>
            </div>
            <p className="mt-2 text-sm text-muted">{S.settings.apiKeyHelp}</p>
            <a
              href={AI_STUDIO_URL}
              target="_blank"
              rel="noreferrer"
              className="mt-1 inline-flex min-h-11 items-center font-medium text-primary underline underline-offset-4"
            >
              {S.settings.getKey} ↗
            </a>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="olive" onClick={() => void onCheck()} disabled={!key.trim() || checking}>
              {checking ? S.settings.checking : S.settings.checkKey}
            </Button>
            {keyStatus && (
              <p role="status" className={keyStatus.ok ? 'font-medium text-secondary' : 'text-primary'}>
                {keyStatus.text}
              </p>
            )}
          </div>
          {keyStatus?.detail && (
            <p dir="ltr" className="break-words rounded-xl bg-surface-2 px-3 py-2 font-mono text-xs text-muted">
              {keyStatus.detail}
            </p>
          )}
          <p className="rounded-xl bg-surface-2 p-3 text-sm text-muted">ℹ️ {S.settings.privacyNote}</p>
        </Section>

        <Section title={S.settings.displaySection}>
          <FontPicker value={s.font} onChange={(font) => updateSettings({ font })} />
          <Segmented<ThemeMode>
            label={S.settings.theme}
            value={s.theme}
            onChange={(theme) => updateSettings({ theme })}
            options={[
              { value: 'auto', label: S.settings.themeAuto },
              { value: 'light', label: S.settings.themeLight },
              { value: 'dark', label: S.settings.themeDark },
            ]}
          />
          <Segmented<ListView>
            label={S.settings.defaultView}
            value={s.view}
            onChange={(view) => updateSettings({ view })}
            options={[
              { value: 'grid', label: S.home.viewGrid },
              { value: 'rows', label: S.home.viewRows },
            ]}
          />
          <div>
            <label htmlFor="font" className="mb-1.5 block font-medium">
              {S.settings.cookFont}: {s.cookFontSize}px
            </label>
            <input
              id="font"
              type="range"
              min={MIN_COOK_FONT}
              max={MAX_COOK_FONT}
              step={2}
              value={s.cookFontSize}
              onChange={(e) => updateSettings({ cookFontSize: Number(e.target.value) })}
              className="h-12 w-full accent-[var(--c-primary)]"
            />
            <p className="rounded-xl bg-surface-2 p-3 font-medium" style={{ fontSize: s.cookFontSize }}>
              {S.settings.cookFontPreview}
            </p>
          </div>
          <Toggle
            label={S.settings.speakTimers}
            checked={s.speakTimers}
            onChange={(v) => {
              updateSettings({ speakTimers: v });
              if (v) speak(S.timers.spokenDone('אפייה'));
            }}
          />
          {notif !== 'unsupported' && (
            <div className="flex min-h-12 items-center justify-between gap-3">
              <span className="font-medium">{S.settings.notifications}</span>
              {notif === 'on' && <span className="text-secondary">{S.settings.notificationsOn}</span>}
              {notif === 'denied' && <span className="text-sm text-muted">{S.settings.notificationsDenied}</span>}
              {notif === 'off' && (
                <Button
                  variant="secondary"
                  onClick={async () => {
                    await Notification.requestPermission();
                    setNotif(notificationState());
                  }}
                >
                  {S.settings.notificationsOff}
                </Button>
              )}
            </div>
          )}
          <Button
            variant="secondary"
            onClick={() => {
              unlockAudio();
              playChime();
              navigator.vibrate?.([300, 150, 300]);
            }}
          >
            🔔 {S.settings.testSound}
          </Button>
        </Section>

        <Section title={S.settings.backupSection}>
          <div>
            <Button variant="secondary" className="w-full" onClick={() => void onExport()}>
              <IconDownload size={20} /> {S.settings.exportAll}
            </Button>
            <p className="mt-1 text-sm text-muted">{S.settings.exportHint}</p>
          </div>
          <div>
            <Button variant="secondary" className="w-full" onClick={() => importRef.current?.click()}>
              <IconUpload size={20} /> {S.settings.importFile}
            </Button>
            <p className="mt-1 text-sm text-muted">{S.settings.importHint}</p>
            <input
              ref={importRef}
              type="file"
              accept=".json,application/json"
              hidden
              onChange={(e) => {
                void onImport(e.target.files);
                e.target.value = '';
              }}
            />
          </div>
        </Section>

        <Section title={S.settings.samplesSection}>
          <Button
            variant="ghost"
            className="border border-line"
            onClick={() => void restoreSamples().then(() => toast(S.settings.samplesRestored))}
          >
            {S.settings.restoreSamples}
          </Button>
        </Section>

        <p className="px-2 text-center text-sm text-muted">
          🔒 {S.settings.about}
        </p>
        <UpdateCheck />
      </div>
    </div>
  );
}
