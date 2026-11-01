const resources = [
  {
    step: "01",
    title: "Learner’s permit (Class CP)",
    description: "Georgia DDS describes the learner’s permit, application steps, required documents, and who can supervise a permit holder.",
    link: "https://dds.georgia.gov/georgia-licenses-ids-and-permits/new-license-id-or-permit/how-do-i-learners-permit",
    linkLabel: "View learner’s permit guidance",
  },
  {
    step: "02",
    title: "Practice and driver education",
    description: "Georgia’s teen driving resources explain supervised practice, driver education, and Joshua’s Law. DDS describes 40 hours of supervised driving, including 6 at night, for applicants seeking a Class D license; other requirements also apply.",
    link: "https://dds.georgia.gov/teen-driving-laws-faqs",
    linkLabel: "Read teen driving FAQs",
  },
  {
    step: "03",
    title: "Provisional license (Class D)",
    description: "Review Georgia DDS’s application requirements, documents, testing, and restrictions for the provisional license. Some circumstances have different rules.",
    link: "https://dds.georgia.gov/georgia-licenses-ids-and-permits/new-license-id-or-permit/how-do-i-class-d",
    linkLabel: "View Class D guidance",
  },
];

export default function StateRequirements() {
  return <main className="flex-1 overflow-auto p-5 md:p-8"><div className="mx-auto max-w-4xl space-y-5">
    <div><p className="text-xs font-semibold uppercase tracking-wide text-[#0C7A8D]">Georgia pilot</p><h2 className="mt-1 text-2xl font-bold">Understanding Georgia’s process</h2><p className="mt-2 text-sm text-muted-foreground">Start with these Georgia Department of Driver Services (DDS) resources for teen drivers and their families.</p></div>
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><strong>Check DDS before making decisions.</strong> This is a brief guide, not a complete list of requirements or an eligibility determination. Rules and individual circumstances can differ. DriveReady’s logs are a personal record, not official certification.</div>
    <div className="grid gap-3">{resources.map((resource) => <article key={resource.step} className="flex gap-4 rounded-2xl border border-border bg-card p-5"><div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-[#E4EFF2] text-sm font-bold text-[#0C7A8D]">{resource.step}</div><div><h3 className="font-semibold">{resource.title}</h3><p className="mt-1 text-sm text-muted-foreground">{resource.description}</p><a href={resource.link} target="_blank" rel="noopener noreferrer" className="mt-3 inline-block text-sm font-medium text-[#0C7A8D] underline">{resource.linkLabel} ↗</a></div></article>)}</div>
    <section className="rounded-2xl border border-border bg-card p-5"><h3 className="font-semibold">More help from Georgia DDS</h3><ul className="mt-3 space-y-2 text-sm"><li><a className="text-[#0C7A8D] underline" href="https://dds.georgia.gov/parent-teen-driving-guide" target="_blank" rel="noopener noreferrer">Parent and teen driving guide ↗</a></li><li><a className="text-[#0C7A8D] underline" href="https://dds.georgia.gov/drivers-manual" target="_blank" rel="noopener noreferrer">Georgia driver’s manual ↗</a></li><li><a className="text-[#0C7A8D] underline" href="https://dds.georgia.gov/teen-drivers" target="_blank" rel="noopener noreferrer">Teen drivers overview ↗</a></li></ul></section>
    <p className="text-xs text-muted-foreground">Sources checked November 1, 2026. Georgia is the first pilot; other states are not yet covered.</p>
  </div></main>;
}
