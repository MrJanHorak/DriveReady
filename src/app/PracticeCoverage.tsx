import { PRACTICE_CONDITIONS, PRACTICE_SKILLS, practiceCoverage } from "./practiceData";

type Drive = { id: string; learnerId: string; date: string; practicedSkills?: string[]; practicedConditions?: string[] };

export default function PracticeCoverage({ drives, learnerId }: { drives: Drive[]; learnerId: string }) {
  const groups = [
    { title: "Skills", choices: PRACTICE_SKILLS, field: "practicedSkills" },
    { title: "Roads and conditions", choices: PRACTICE_CONDITIONS, field: "practicedConditions" },
  ];
  return <section className="rounded-2xl border border-border bg-card p-5">
    <h3 className="font-semibold">Practice coverage</h3>
    <p className="mt-1 text-sm text-muted-foreground">See what you’ve recorded and what you may want to explore. A record shows exposure, not mastery or readiness. Older free-text entries are not counted until you edit and select their tags.</p>
    <div className="mt-4 grid gap-5 md:grid-cols-2">{groups.map((group) => <div key={group.title}>
      <h4 className="text-sm font-semibold">{group.title}</h4>
      <ul className="mt-2 divide-y divide-border">{practiceCoverage(drives, learnerId, group.field, group.choices).map((item) => <li key={item.label} className="flex items-center justify-between gap-3 py-2 text-sm">
        <span>{item.label}</span><span className="text-right text-xs text-muted-foreground">{item.count ? `${item.count} ${item.count === 1 ? "drive" : "drives"} · last ${item.lastDate}` : "Not recorded yet"}</span>
      </li>)}</ul>
    </div>)}</div>
  </section>;
}

export function PracticeChoices({ legend, choices, selected, onChange }: { legend: string; choices: string[]; selected: string[]; onChange: (items: string[]) => void }) {
  return <fieldset className="rounded-lg border border-border bg-background p-3 sm:col-span-2">
    <legend className="px-1 text-sm font-medium">{legend} <span className="font-normal text-muted-foreground">(optional)</span></legend>
    <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-4">{choices.map((choice) => <label key={choice} className="flex items-center gap-2 text-sm"><input type="checkbox" className="accent-[#0C7A8D]" checked={selected.includes(choice)} onChange={(event) => onChange(event.target.checked ? [...selected, choice] : selected.filter((item) => item !== choice))} />{choice}</label>)}</div>
  </fieldset>;
}
