# Keyboard focus visibility fix

Actor: `/root/tour_ux`. Scope: accepted no-cover criterion, `tour/tour.css` only.

The source-aware integration check found the sticky bottom navigation covering keyboard-focused evidence tabs, download links, transaction links and a proof card at 390 × 844. The browser considered those controls inside the viewport and did not scroll them above the overlay.

Changed `.tour-navigation` from sticky bottom positioning to normal document flow (`position: static`), removing its `bottom` and stacking override at every viewport width. This eliminates the overlay rather than relying on browser-specific focus scrolling or guessed footer height. Existing top guide action and bottom Back/Next controls remain; no control or scene behavior changed.

Verification: inspected the stylesheet and confirmed one navigation positioning rule, now static, with no responsive sticky override. No build or baseline browser mutation performed because the separate fresh review is still using that build. Parent must rebuild; independent integration should rerun its focused-element visibility reproduction against the new output before publication.
