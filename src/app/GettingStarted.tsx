import { unrecordedSkills } from "./practiceData";

type Drive = { id: string; learnerId: string; date: string; practicedSkills?: string[] };

export default function GettingStarted({ drives, learnerId }: { drives: Drive[]; learnerId?: string }) {
  const unrecorded = learnerId ? unrecordedSkills(drives, learnerId) : [];
  const ownDrives = drives.filter((drive) => drive.learnerId === learnerId);
  const hasTags = ownDrives.some((drive) => drive.practicedSkills?.length);
  return <details className="rounded-2xl border border-[#0C7A8D]/20 bg-card p-5">
    <summary className="cursor-pointer font-semibold">Where to start · practice ideas</summary>
    <div className="mt-2 flex flex-wrap items-start justify-between gap-2"><p className="text-sm text-muted-foreground">Choose ideas that fit your learner; there’s no required order.</p><span className="rounded-full bg-[#E4EFF2] px-2.5 py-1 text-xs font-medium text-[#0C7A8D]">For supervisors</span></div>
    <div className="mt-4 grid gap-3 md:grid-cols-2">
      <div className="rounded-xl bg-muted/40 p-4"><h4 className="text-sm font-semibold">Before a practice drive</h4><p className="mt-1 text-sm text-muted-foreground">Discuss one thing you’d both like to work on, and agree on a setting that suits the learner’s experience. Georgia’s guide includes activities for introducing vehicle controls and basic maneuvers.</p><a className="mt-2 inline-block text-sm text-[#0C7A8D] underline" href="https://dds.georgia.gov/parent-teen-driving-guide" target="_blank" rel="noopener noreferrer">Georgia DDS parent and teen guide ↗</a></div>
      <div className="rounded-xl bg-muted/40 p-4"><h4 className="text-sm font-semibold">Make it a conversation</h4><p className="mt-1 text-sm text-muted-foreground">Talk about expectations and safe habits before driving, then ask what felt comfortable and what you’d like to revisit afterward.</p><a className="mt-2 inline-block text-sm text-[#0C7A8D] underline" href="https://www.nhtsa.gov/road-safety/teen-driving" target="_blank" rel="noopener noreferrer">NHTSA guidance for families ↗</a></div>
    </div>
    {learnerId && <div className="mt-4 border-t border-border pt-4"><h4 className="text-sm font-semibold">Ideas to consider</h4>
      {!hasTags ? <p className="mt-1 text-sm text-muted-foreground">Choose any skills that fit your learner. When you log a drive and select skills, this space will show which choices have not been recorded yet. Earlier free-text notes aren’t counted unless you edit the log and select the matching skills.</p> : unrecorded.length ? <><p className="mt-1 text-sm text-muted-foreground">These skills haven’t been selected in this learner’s logs. That doesn’t mean they haven’t been practiced or are the right next step.</p><ul className="mt-2 flex flex-wrap gap-2">{unrecorded.map((skill) => <li key={skill} className="rounded-full border border-border px-3 py-1 text-xs">{skill}</li>)}</ul></> : <p className="mt-1 text-sm text-muted-foreground">All listed skills appear in your logs. You can revisit any skill and look at roads and conditions in Practice coverage.</p>}
    </div>}
    <p className="mt-4 text-xs text-muted-foreground">These are starting points, not a readiness assessment. Review current state guidance and choose activities appropriate to the learner and conditions. Resources checked November 1, 2026.</p>
  </details>;
}
