// Checkbox group for the practice catalogue (src/app/practiceData.js).
export function PracticeChoices({ legend, choices, selected, onChange, disabled = false }: { legend: string; choices: string[]; selected: string[]; onChange: (items: string[]) => void; disabled?: boolean }) {
  return <fieldset disabled={disabled} className="rounded-lg border border-border bg-background p-3 sm:col-span-2">
    <legend className="px-1 text-sm font-medium">{legend} <span className="font-normal text-muted-foreground">(optional)</span></legend>
    <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-4">{choices.map((choice) => <label key={choice} className="flex items-center gap-2 text-sm"><input type="checkbox" className="accent-[#0C7A8D]" checked={selected.includes(choice)} onChange={(event) => onChange(event.target.checked ? [...selected, choice] : selected.filter((item) => item !== choice))} />{choice}</label>)}</div>
  </fieldset>;
}
