const CORNERS = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];

document
    .querySelectorAll('[data-callout-type="readaloud"], [data-callout-type="readaloud-serif"]')
    .forEach((callout) => {
        CORNERS.forEach((corner) => {
            const dot = document.createElement('span');
            dot.className = `corner-circle ${corner}`;
            callout.appendChild(dot);
        });
    });
