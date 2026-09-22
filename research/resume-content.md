# Verified homepage resume and contact content

Prepared 2026-09-19 from the two supplied resumes. Verified here means checked against those documents, not independently confirmed with employers or live accounts. The user expects updated resumes soon.

## Replacement for `.context-spine`

Preserves the existing `div > div > span.mono + p > small` structure. Internship summaries use past tense; summer dates are not expanded into guessed months. Wifi Concierge's `2024-Present` is exactly the supplied tech resume's date range, not a fresh confirmation of ongoing work. Recheck that status when the updated resume arrives.

```html
<div class="context-spine">
  <div>
    <span class="mono">EXPECTED MAY 2030</span>
    <p>Vanderbilt University, School of Engineering<br><small>B.E. in Computer Science, Minor in Data Science</small></p>
  </div>
  <div>
    <span class="mono">2024-Present</span>
    <p>Wifi Concierge · Founder &amp; Web Developer<br><small>Founded a community technology initiative serving 70+ individuals and families; built and maintained its website.</small></p>
  </div>
  <div>
    <span class="mono">Summer 2025</span>
    <p>Cleveland Clinic · Radiology Department Intern<br><small>Worked in an AI-focused radiology environment with exposure to machine learning, image processing, and healthcare AI.</small></p>
  </div>
  <div>
    <span class="mono">Summer 2025</span>
    <p>PCs for People · Technology Department Intern<br><small>Reconditioned and configured computers for affordable resale to underserved families.</small></p>
  </div>
  <div>
    <span class="mono">Summer 2024</span>
    <p>Hyland Software · R&amp;D Intern<br><small>Evaluated Hy-Tech Club course content and redesigned the program homepage.</small></p>
  </div>
</div>
```

Education is an expected degree, not an earned credential. The two Summer 2025 roles share a date range; their order does not establish which came first. Carat Coin is a project in both resumes, with no employment title or dates; do not turn it into a dated job.

## Contact and download links

Email: `ethan.b.chen@vanderbilt.edu`. LinkedIn: `https://www.linkedin.com/in/ethanbchen/`.

Both match the resumes. The tech PDF supplies the exact `mailto:` and LinkedIn annotation targets; the Canva PDF corroborates their printed text. Delivery and live profile availability were not tested.

```html
<a href="mailto:ethan.b.chen@vanderbilt.edu">Email <span aria-hidden="true">↗</span></a>
<a href="https://www.linkedin.com/in/ethanbchen/">LinkedIn <span aria-hidden="true">↗</span></a>
<a href="/resume.pdf" download>Resume <span aria-hidden="true">↓</span></a>
```

The downloadable tech resume is the current supplied version, copied unmodified to `public/resume.pdf` and served at `/resume.pdf`. Replace that file with the next approved tech resume to preserve the stable download link. The homepage snippets contain no home address or phone number; the unmodified downloadable PDF retains its original contents.

## Tiny human copy

```html
<p>Outside software: piano, chess, and clarinet.</p>
```

Optional, more specific historical detail:

```html
<p>I co-led University School's Chess Club (2022-2026) and was first-chair clarinet in its orchestra in 2026.</p>
```

Do not carry over the Canva resume's “current #4” chess ranking as a current homepage claim; it has not been independently verified or dated beyond that document.

## Content provenance

- **Tech resume, page 1:** `/Users/ethius/Desktop/Resume : Intern Stuff/Ethan_B_Chen_Resume_Tech.pdf`. Primary source for the expected May 2030 degree, exact experience titles and dates, concise experience summaries, 70+ people/families, and contact hyperlink destinations. Sole source of the downloadable PDF bytes.
- **Canva resume, page 1:** `/Users/ethius/Desktop/Resume : Intern Stuff/Canva Resume New.pdf`. Corroborates the three internship titles and summer dates, email, and printed LinkedIn URL.
- **Canva resume, page 2:** Lists Chess, Piano, and Clarinet among hobbies; supplies Chess Club co-leadership (2022-2026), first-chair clarinet (2026), and Wifi Concierge founder dates (2024-Present). These support the human copy without implying a current school leadership role.
- **Existing `index.html`:** Supplies the `.context-spine` markup pattern and contact-link conventions only; not used to infer employment dates or credentials.
- **Existing `research/homepage-direction.md`:** Identifies resume/contact verification as pending. This note supplies that document-based verification without changing the earlier research file.

Only `research/resume-content.md` and `public/resume.pdf` were written for this task. No homepage/source edits, deployments, or commits.
