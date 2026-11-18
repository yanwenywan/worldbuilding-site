// Moves the navbar sections into the menu button whenever they no longer fit beside the search.
// Collapsed links stay laid out (just hidden), so they can still be measured on every resize.
const navbar = document.querySelector<HTMLElement>(".navbar");
const inner = document.querySelector<HTMLElement>(".navbar-inner");
const links = document.querySelector<HTMLElement>(".navbar-links");
const items = document.querySelectorAll<HTMLElement>(".navbar-item");

function linksOverflow(): boolean {
    if (links === null || items.length === 0) {
        return false;
    }
    const lastItem = items[items.length - 1];
    return lastItem.getBoundingClientRect().right > links.getBoundingClientRect().right + 1;
}

function updateCollapsed() {
    navbar?.classList.toggle("navbar-collapsed", linksOverflow());
}

if (inner !== null) {
    new ResizeObserver(updateCollapsed).observe(inner);
}
document.fonts.ready.then(updateCollapsed);
