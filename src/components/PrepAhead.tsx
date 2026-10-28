import { leadLabel, prepTimerLabel, type PrepPlanItem } from '../lib/prepAhead';
import { S } from '../strings.he';
import { IconFlame, IconHourglass } from './Icons';
import { StepTimerButton } from './TimerUI';

function when(p: PrepPlanItem): string {
  if (p.tooLate) return S.prep.tooLate(leadLabel(p.leadMinutes));
  return p.startIndex === 0 ? S.prep.startNow : S.prep.startAt(p.startIndex + 1);
}

/** Interface icon for a prep hint (the hint's own emoji is data, not shown as an icon). */
function PrepIcon({ p, size = 20 }: { p: PrepPlanItem; size?: number }) {
  return p.emoji === '🔥' || p.emoji === '♨️' ? <IconFlame size={size} /> : <IconHourglass size={size} />;
}

/** Overview on the recipe intro screen: everything to start ahead, and when. */
export function PrepCard({ plan }: { plan: PrepPlanItem[] }) {
  if (plan.length === 0) return null;
  return (
    <section className="mt-6 rounded-card bg-surface-2 p-4" aria-labelledby="prep-h">
      <h2 id="prep-h" className="flex items-center gap-2 text-xl font-bold">
        <IconHourglass size={22} className="text-muted" />
        {S.prep.title}
      </h2>
      <p className="mb-3 text-sm text-muted">{S.prep.hint}</p>
      <ul className="flex flex-col gap-2">
        {plan.map((p, i) => (
          <li key={i} className="flex gap-3 rounded-xl bg-surface p-3">
            <span className="mt-0.5 shrink-0 text-muted" aria-hidden="true">
              <PrepIcon p={p} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-base font-medium">{p.text}</p>
              <p className="text-sm text-muted">
                {S.prep.takes(leadLabel(p.leadMinutes))} · {S.prep.neededAt(p.neededIndex + 1)}
              </p>
              <p className={`text-sm font-medium ${p.startIndex === 0 || p.tooLate ? 'text-primary' : 'text-ink'}`}>{when(p)}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** In cook mode: what to start during this step, with a timer for the waiting time. */
export function PrepReminders({
  plan,
  stepIndex,
  recipe,
  runningFor,
}: {
  plan: PrepPlanItem[];
  stepIndex: number;
  recipe: { id: string; title: string };
  runningFor: (label: string) => string | undefined;
}) {
  const now = plan.filter((p) => p.startIndex === stepIndex);
  if (now.length === 0) return null;
  return (
    <section className="anim-fade-up mb-6 rounded-card bg-surface-2 p-4" role="note">
      <h2 className="mb-2 flex items-center gap-2 text-base font-bold text-primary">
        <IconHourglass size={18} />
        {stepIndex === 0 ? S.prep.beforeStart : S.prep.nowIsTime}
      </h2>
      <ul className="flex flex-col gap-3">
        {now.map((p, i) => (
          <li key={i}>
            <p className="flex items-start gap-2 text-lg font-medium">
              <span className="mt-1 shrink-0 text-muted" aria-hidden="true">
                <PrepIcon p={p} size={18} />
              </span>
              <span>
                {p.text} <span className="text-sm font-normal text-muted">{S.prep.forStep(p.neededIndex + 1)}</span>
              </span>
            </p>
            {p.leadMinutes <= 120 && (
              <div className="mt-2">
                <StepTimerButton timer={{ label: prepTimerLabel(p), seconds: p.leadMinutes * 60 }} recipe={recipe} runningId={runningFor(prepTimerLabel(p))} />
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
