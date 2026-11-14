import type { ReactNode } from "react";
import { Card, heading, mono } from "./design";
import { PRIVACY_CONTACT, privacyContactIsPlaceholder } from "./contact";
import { routing, tiles } from "./mapProviders";

// Plain-language privacy notice for the development preview. Keep it in step with
// what the code and hosting actually do (see FIREBASE_SETUP.md and DEPLOYMENT.md).
export const PRIVACY_UPDATED = "November 13, 2026";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return <section className="space-y-2">
    <h3 className="text-base font-bold" style={heading}>{title}</h3>
    <div className="space-y-2 text-sm leading-relaxed text-foreground/90">{children}</div>
  </section>;
}

export default function Privacy() {
  return <main className="relative flex-1 overflow-auto p-4 sm:p-6" aria-label="Privacy notice"><div className="mx-auto max-w-3xl">
    <Card className="space-y-6 p-6 sm:p-8">
      <header>
        <p className="text-[11px] font-semibold uppercase tracking-widest text-[#0C7A8D]" style={mono}>Privacy · updated {PRIVACY_UPDATED}</p>
        <h2 className="mt-1 text-xl font-bold" style={heading}>What DriveReady keeps, and who can see it</h2>
        <p className="mt-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">DriveReady is a development preview. Please use fictional names, notes and places. This notice explains what the app does today; it is not legal advice, and a full privacy policy will be needed before real families use it.</p>
      </header>

      <Section title="What is stored">
        <ul className="list-disc space-y-1.5 pl-5">
          <li><strong>Your account:</strong> your email address and sign-in, handled by Google Firebase Authentication. DriveReady never sees your password.</li>
          <li><strong>Learner spaces:</strong> the learner name or nickname you enter, who belongs to the space and their role, and the email each person had when they joined.</li>
          <li><strong>Practice:</strong> drive dates, minutes, night minutes, skills and conditions, shared notes, the learner’s own reflections, routes (name, start and destination descriptions, and map points), whether a learner’s suggested route was approved and any reason given, who recorded or last edited a drive, and the supervisor reported as present.</li>
          <li><strong>Invitations:</strong> the invitee’s email and role. Invitation codes are stored only in scrambled (hashed) form.</li>
          <li><strong>On your device only:</strong> your sign-in session and a running drive timer are kept in this browser’s storage. A timer is cleared once its drive is saved or discarded. Start times you type into the drive form are used for the night-minutes suggestion and are not saved with the drive.</li>
        </ul>
      </Section>

      <Section title="Who can see it">
        <ul className="list-disc space-y-1.5 pl-5">
          <li>Everyone in a learner’s space (the managing supervisor, invited supervisors and the learner) can see that space’s routes, drives and notes. Notes are shared; there are no private notes.</li>
          <li>Only the managing supervisor can see the list of people and pending invitations.</li>
          <li>People outside a space cannot see anything in it. Routes stay private unless the managing supervisor shares one with the community.</li>
          <li><strong>Community library:</strong> a route the managing supervisor shares can be seen by anyone signed in to DriveReady. The shared copy has the public name, general area, description, skills and conditions they enter, and the whole route line, including where it starts and ends. Before sharing, they confirm the route doesn’t start, end or pass at their home, school or another private place; share routes that begin and end at a public place. It never includes the learner’s name, who is in the space, or the start and destination descriptions. Choose a public name and description that don’t identify your family. Stopping sharing removes it from the library, but families who already saved it keep their copy.</li>
          <li><strong>Ratings, tips and counts:</strong> community routes show how many families saved and practised them and how many times they were driven, as totals only. If you rate a route, only the average is public. Tips you leave are shown without your name. A drive you log on a community route adds to its count, but nobody can see who drove it or when.</li>
          <li><strong>Reports:</strong> if you report a community route, your reason and note are seen only by DriveReady’s moderators, and the family who shared it isn’t told who reported it.</li>
          <li>Learners may be under 18. A parent or guardian should create and manage a minor’s space and decide whether the learner gets their own sign-in.</li>
        </ul>
      </Section>

      <Section title="Services involved">
        <ul className="list-disc space-y-1.5 pl-5">
          <li><strong>Google Firebase</strong> (Authentication and Cloud Firestore, United States) stores accounts and practice data.</li>
          <li><strong>Railway</strong> runs DriveReady’s service, which checks permissions and saves changes. DriveReady’s own request logs record only the request path, result and timing.</li>
          <li><strong>Vercel</strong> serves the web app.</li>
          <li>{tiles.custom ? <><strong>The map image provider</strong> configured for this site</> : <><strong>OpenStreetMap</strong></>} provides the map images, so it sees the map area you view and your internet address.</li>
          <li>{routing.custom ? <><strong>The road-routing provider</strong> configured for this site</> : <><strong>OSRM</strong> (a public routing demo)</>} receives the map points you choose when you select <em>Follow roads</em> or save a route.</li>
        </ul>
        <p>Hosting providers may keep their own technical access logs under their own terms. DriveReady has no advertising or analytics trackers. Printing or saving a practice log as PDF happens in your browser; nothing extra is sent.</p>
      </Section>

      <Section title="Your choices">
        <ul className="list-disc space-y-1.5 pl-5">
          <li>Delete drives and routes you’re allowed to edit, under <strong>Driving Logs</strong> and <strong>Routes</strong>.</li>
          <li>Leave a learner’s space under <strong>People &amp; access</strong>. You lose access; what you recorded stays with the learner’s practice history.</li>
          <li>A managing supervisor can delete a learner’s whole space, which permanently removes its drives, routes, notes and invitations.</li>
          <li>Delete your account under <strong>Account</strong>. You confirm with your email and password; if you manage a learner’s space, delete that space first. Your sign-in, your access and your email on the spaces you belonged to are removed. Drives and routes you recorded stay in the learner’s practice history.</li>
          <li>Printed or saved practice logs, screenshots and copies others have already downloaded can’t be recalled from inside the app.</li>
        </ul>
      </Section>

      <Section title="Questions and requests">
        <p>To ask what is stored about you, to correct something, or for help deleting data, email <a className="font-medium text-[#0C7A8D] underline" href={`mailto:${PRIVACY_CONTACT}`}>{PRIVACY_CONTACT}</a>.</p>
        {privacyContactIsPlaceholder && <p className="rounded-lg bg-amber-50 p-3 text-amber-900">This address is a placeholder and isn’t monitored yet.</p>}
      </Section>
    </Card>
  </div></main>;
}
