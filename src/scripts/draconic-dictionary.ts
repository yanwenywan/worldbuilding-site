const SHEET_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vSxP3pgOC6nikZCUeYJ2Ak4I_wZM4w5Q0whpDMvQmnHMICAfvPVN9DcRtOjUIM85k9I3YZ8pIoa_bKe/pub?output=csv&gid=1014274663";
const CACHE_KEY = "draconic_dictionary_v2";
const CACHE_TTL_MS = 10 * 60 * 1000;
const ALL_COLUMNS = "all";

interface SheetData {
    headers: string[];
    rows: string[][];
}

interface CachedSheet extends SheetData {
    savedAt: number;
}

interface Entry {
    row: HTMLTableRowElement;
    searchText: string[];
}

function parseCsv(text: string): string[][] {
    const rows: string[][] = [];
    let row: string[] = [];
    let cell = "";
    let inQuotes = false;

    for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (inQuotes) {
            if (c === '"' && text[i + 1] === '"') {
                cell += '"';
                i++;
            } else if (c === '"') {
                inQuotes = false;
            } else {
                cell += c;
            }
        } else if (c === '"') {
            inQuotes = true;
        } else if (c === ",") {
            row.push(cell.trim());
            cell = "";
        } else if (c === "\n") {
            row.push(cell.trim());
            rows.push(row);
            row = [];
            cell = "";
        } else if (c !== "\r") {
            cell += c;
        }
    }
    row.push(cell.trim());
    rows.push(row);
    return rows;
}

function isBlank(row: string[]): boolean {
    return row.every((cell) => cell === "");
}

function startsWithDigit(text: string): boolean {
    return /^\d/.test(text);
}

function compareEntries(a: string[], b: string[]): number {
    const aEnglish = a[0] ?? "";
    const bEnglish = b[0] ?? "";
    const aIsNumber = startsWithDigit(aEnglish);
    const bIsNumber = startsWithDigit(bEnglish);
    if (aIsNumber !== bIsNumber) {
        return aIsNumber ? 1 : -1;
    }
    return aEnglish.localeCompare(bEnglish, "en", { sensitivity: "base" });
}

function toSheetData(csv: string): SheetData {
    const allRows = parseCsv(csv);
    const headers = allRows[0];
    const rows = allRows.slice(1).filter((row) => !isBlank(row));
    for (const row of rows) {
        while (row.length < headers.length) {
            row.push("");
        }
    }
    rows.sort(compareEntries);
    return { headers: headers, rows: rows };
}

function readCache(): SheetData | null {
    try {
        const cached = JSON.parse(localStorage.getItem(CACHE_KEY) ?? "null") as CachedSheet | null;
        if (cached && Date.now() - cached.savedAt < CACHE_TTL_MS) {
            return cached;
        }
    } catch {
        return null;
    }
    return null;
}

function writeCache(data: SheetData): void {
    try {
        const cached: CachedSheet = { headers: data.headers, rows: data.rows, savedAt: Date.now() };
        localStorage.setItem(CACHE_KEY, JSON.stringify(cached));
    } catch {
        // Storage can be full or blocked; the dictionary still works without it.
    }
}

async function loadSheet(): Promise<SheetData> {
    const cached = readCache();
    if (cached) {
        return cached;
    }
    const response = await fetch(SHEET_URL);
    if (!response.ok) {
        throw new Error(`Dictionary sheet returned ${response.status}`);
    }
    const data = toSheetData(await response.text());
    writeCache(data);
    return data;
}

function normalise(text: string): string {
    return text
        .normalize("NFD")
        .replace(/\p{Diacritic}/gu, "")
        .replaceAll("'", "")
        .toLowerCase();
}

// I{...} becomes a button that reveals irregular forms; __u__, **b**, *i* or _i_, and `code` become HTML.
function formatCell(text: string): string {
    return text
        .replace(
            /I\{([^}]+)\}/g,
            (_match, forms) => `<button type="button" class="dictionary-irregular" aria-expanded="false"><strong>I</strong><span class="dictionary-irregular-forms" hidden>${forms}</span></button>`,
        )
        .replace(/__(.+?)__/g, "<u>$1</u>")
        .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
        .replace(/(?:\*|_)([^*_]+?)(?:\*|_)/g, "<em>$1</em>")
        .replace(/`([^`]+?)`/g, "<code>$1</code>");
}

class DraconicDictionary {
    private input: HTMLInputElement;
    private table: HTMLTableElement;
    private status: HTMLElement;
    private columnButtons: HTMLButtonElement[];

    private entries: Entry[] = [];
    private activeColumn = ALL_COLUMNS;

    constructor(root: HTMLElement) {
        this.input = root.querySelector(".dictionary-search") as HTMLInputElement;
        this.table = root.querySelector(".dictionary-table") as HTMLTableElement;
        this.status = root.querySelector(".dictionary-status") as HTMLElement;
        this.columnButtons = Array.from(root.querySelectorAll<HTMLButtonElement>(".dictionary-column"));

        this.input.addEventListener("input", () => this.filter());
        this.columnButtons.forEach((button) => {
            button.addEventListener("click", () => this.selectColumn(button.dataset.column ?? ALL_COLUMNS));
        });
        this.table.addEventListener("click", (event) => this.handleTableClick(event));
        document.addEventListener("keydown", (event) => this.handleKey(event));

        loadSheet()
            .then((data) => this.build(data))
            .catch((error) => {
                this.status.textContent = "Failed to load dictionary. Please refresh.";
                console.error(error);
            });
    }

    private build(data: SheetData): void {
        const headerRow = this.table.createTHead().insertRow();
        for (const header of data.headers) {
            const th = document.createElement("th");
            th.textContent = header;
            headerRow.appendChild(th);
        }

        const body = this.table.createTBody();
        for (const cells of data.rows) {
            const row = body.insertRow();
            for (const cell of cells) {
                row.insertCell().innerHTML = formatCell(cell);
            }
            this.entries.push({ row: row, searchText: cells.map(normalise) });
        }

        this.status.hidden = true;
        this.filter();
    }

    private selectColumn(column: string): void {
        this.activeColumn = column;
        this.columnButtons.forEach((button) => {
            button.classList.toggle("active", button.dataset.column === column);
        });
        this.filter();
    }

    private filter(): void {
        const words = normalise(this.input.value.trim()).split(/\s+/).filter((word) => word !== "");
        let shown = 0;
        for (const entry of this.entries) {
            const matches = words.every((word) => this.entryContains(entry, word));
            entry.row.hidden = !matches;
            if (matches) {
                shown++;
            }
        }
        this.showEmptyMessage(shown === 0 && this.entries.length > 0);
    }

    private entryContains(entry: Entry, word: string): boolean {
        if (this.activeColumn === ALL_COLUMNS) {
            return entry.searchText.some((text) => text.includes(word));
        }
        const text = entry.searchText[Number(this.activeColumn)] ?? "";
        return text.includes(word);
    }

    private showEmptyMessage(empty: boolean): void {
        if (empty) {
            this.status.textContent = "No matching words.";
        }
        if (this.entries.length > 0) {
            this.status.hidden = !empty;
        }
    }

    private reset(): void {
        this.input.value = "";
        this.selectColumn(ALL_COLUMNS);
    }

    private handleTableClick(event: Event): void {
        const button = (event.target as HTMLElement).closest(".dictionary-irregular");
        if (!button) {
            return;
        }
        const forms = button.querySelector(".dictionary-irregular-forms") as HTMLElement;
        forms.hidden = !forms.hidden;
        button.setAttribute("aria-expanded", String(!forms.hidden));
    }

    // Esc clears the search; Ctrl/Cmd + Alt + 1–6 picks a column.
    private handleKey(event: KeyboardEvent): void {
        if (event.key === "Escape") {
            this.reset();
            return;
        }
        if (!(event.ctrlKey || event.metaKey) || !event.altKey) {
            return;
        }
        const digit = /^Digit([1-6])$/.exec(event.code);
        if (digit) {
            event.preventDefault();
            this.selectColumn(String(Number(digit[1]) - 1));
            this.input.focus();
        }
    }
}

document.querySelectorAll<HTMLElement>(".dictionary").forEach((root) => new DraconicDictionary(root));
