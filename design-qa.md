# Design QA

final result: passed

Reference:
- User screenshot: target role card text clipped by the card edge.
- User direction: keep pages in the same horizontal dashboard direction, move company search to the second page, search recruiting/campus/ATS sites, align the tracker page, and make written-test types openable with question bank upload.

Prototype checked:
- URL: http://127.0.0.1:4175/
- CSS cache version: styles.css?v=20260724-fit9

Homepage checks:
- Target role and keyword inputs are multi-line scrollable fields inside the first card.
- Company search is no longer on the first page; it routes to the second page.
- Resume profile and JD match blocks keep the same beige, black, yellow, and orange visual system.
- No document-level horizontal scrolling at 1440 x 900 or 1280 x 720.

Today page checks:
- Today page uses a horizontal three-column dashboard: filters, job results, company/source management.
- Company search explains that it finds campus, careers, and ATS recruiting pages.
- Job cards use natural content height inside an internally scrolling list, so buttons and text are not clipped.
- Recruitment source pool supports add/search, per-source remove, clear-custom, and restore-default controls.

Tracker page checks:
- Tracker page now uses a horizontal layout: email sync and board on the left, manual record form on the right.
- Email search actions share one row with consistent button height and no text overlap.
- Application form fields are aligned in a single side panel.
- Board columns have fixed headers and internally scrolling card lists.

Assessment checks:
- Written-test card opens the practice panel.
- Practice types are clickable cards.
- JSON question bank upload was tested and updates the practice status.

Functional checks:
- JS syntax passed.
- Server syntax passed.
- No duplicate HTML IDs.
- Local crawl API returns fallback recruiting-site search entries when a custom company search cannot resolve a recruiting site.
- Local crawl API directly extracted items from a known recruiting-site URL.

Notes:
- The prototype remains zero-cost. It does not bypass login, CAPTCHA, or recruiting-site anti-crawling limits.
