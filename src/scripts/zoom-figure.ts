const MAX_SCALE = 4;
const BUTTON_ZOOM_FACTOR = 1.5;
const DOUBLE_CLICK_ZOOM_FACTOR = 2.5;
const WHEEL_SENSITIVITY = 0.002;

interface Point {
    x: number;
    y: number;
}

class ZoomViewer {
    private dialog: HTMLDialogElement;
    private viewport: HTMLElement;
    private image: HTMLImageElement;

    private scale = 1;
    private fitScale = 1;
    private offsetX = 0;
    private offsetY = 0;

    private pointers = new Map<number, Point>();
    private lastPinchDistance = 0;

    constructor(figure: HTMLElement) {
        this.dialog = figure.querySelector(".zoom-dialog") as HTMLDialogElement;
        this.viewport = figure.querySelector(".zoom-dialog-viewport") as HTMLElement;
        this.image = figure.querySelector(".zoom-dialog-image") as HTMLImageElement;

        const openButton = figure.querySelector(".zoom-figure-open") as HTMLButtonElement;
        openButton.addEventListener("click", () => this.open());

        this.dialog.querySelectorAll<HTMLButtonElement>("[data-zoom]").forEach((button) => {
            button.addEventListener("click", () => this.handleButton(button.dataset.zoom));
        });

        this.viewport.addEventListener("wheel", (event) => this.handleWheel(event), { passive: false });
        this.viewport.addEventListener("pointerdown", (event) => this.handlePointerDown(event));
        this.viewport.addEventListener("pointermove", (event) => this.handlePointerMove(event));
        this.viewport.addEventListener("pointerup", (event) => this.handlePointerUp(event));
        this.viewport.addEventListener("pointercancel", (event) => this.handlePointerUp(event));
        this.viewport.addEventListener("dblclick", (event) => this.handleDoubleClick(event));
        this.dialog.addEventListener("keydown", (event) => this.handleKey(event));
        window.addEventListener("resize", () => this.handleResize());
    }

    private open(): void {
        this.dialog.showModal();
        if (!this.image.src) {
            this.image.addEventListener("load", () => this.fit(), { once: true });
            this.image.src = this.image.dataset.src ?? "";
        } else {
            this.fit();
        }
    }

    private handleButton(action: string | undefined): void {
        const centre = this.viewportCentre();
        if (action === "in") {
            this.zoomAt(BUTTON_ZOOM_FACTOR, centre);
        } else if (action === "out") {
            this.zoomAt(1 / BUTTON_ZOOM_FACTOR, centre);
        } else if (action === "fit") {
            this.fit();
        } else if (action === "close") {
            this.dialog.close();
        }
    }

    private handleKey(event: KeyboardEvent): void {
        const centre = this.viewportCentre();
        if (event.key === "+" || event.key === "=") {
            this.zoomAt(BUTTON_ZOOM_FACTOR, centre);
        } else if (event.key === "-") {
            this.zoomAt(1 / BUTTON_ZOOM_FACTOR, centre);
        } else if (event.key === "0") {
            this.fit();
        }
    }

    private handleWheel(event: WheelEvent): void {
        event.preventDefault();
        const factor = Math.exp(-event.deltaY * WHEEL_SENSITIVITY);
        this.zoomAt(factor, this.toViewportPoint(event));
    }

    private handleDoubleClick(event: MouseEvent): void {
        const isZoomedIn = this.scale > this.fitScale * 1.01;
        if (isZoomedIn) {
            this.fit();
        } else {
            this.zoomAt(DOUBLE_CLICK_ZOOM_FACTOR, this.toViewportPoint(event));
        }
    }

    private handlePointerDown(event: PointerEvent): void {
        this.viewport.setPointerCapture(event.pointerId);
        this.pointers.set(event.pointerId, this.toViewportPoint(event));
        this.viewport.classList.add("dragging");
        if (this.pointers.size === 2) {
            this.lastPinchDistance = this.pinchDistance();
        }
    }

    private handlePointerMove(event: PointerEvent): void {
        const previous = this.pointers.get(event.pointerId);
        if (!previous) {
            return;
        }
        const current = this.toViewportPoint(event);
        this.pointers.set(event.pointerId, current);

        if (this.pointers.size === 1) {
            this.offsetX += current.x - previous.x;
            this.offsetY += current.y - previous.y;
            this.render();
        } else if (this.pointers.size === 2) {
            const distance = this.pinchDistance();
            this.zoomAt(distance / this.lastPinchDistance, this.pinchCentre());
            this.lastPinchDistance = distance;
        }
    }

    private handlePointerUp(event: PointerEvent): void {
        this.pointers.delete(event.pointerId);
        if (this.pointers.size === 0) {
            this.viewport.classList.remove("dragging");
        }
    }

    private handleResize(): void {
        if (!this.dialog.open) {
            return;
        }
        const wasFitted = this.scale === this.fitScale;
        this.fitScale = this.calculateFitScale();
        if (wasFitted) {
            this.fit();
        } else {
            this.render();
        }
    }

    private fit(): void {
        this.fitScale = this.calculateFitScale();
        this.scale = this.fitScale;
        this.offsetX = (this.viewport.clientWidth - this.scaledWidth()) / 2;
        this.offsetY = (this.viewport.clientHeight - this.scaledHeight()) / 2;
        this.render();
    }

    private calculateFitScale(): number {
        const widthRatio = this.viewport.clientWidth / this.image.naturalWidth;
        const heightRatio = this.viewport.clientHeight / this.image.naturalHeight;
        return Math.min(widthRatio, heightRatio, 1);
    }

    private zoomAt(factor: number, anchor: Point): void {
        const maxScale = Math.max(MAX_SCALE, this.fitScale);
        const newScale = Math.min(Math.max(this.scale * factor, this.fitScale), maxScale);
        const ratio = newScale / this.scale;
        this.offsetX = anchor.x - (anchor.x - this.offsetX) * ratio;
        this.offsetY = anchor.y - (anchor.y - this.offsetY) * ratio;
        this.scale = newScale;
        this.render();
    }

    private render(): void {
        this.offsetX = this.clampOffset(this.offsetX, this.scaledWidth(), this.viewport.clientWidth);
        this.offsetY = this.clampOffset(this.offsetY, this.scaledHeight(), this.viewport.clientHeight);
        this.image.style.transform = `translate(${this.offsetX}px, ${this.offsetY}px) scale(${this.scale})`;
    }

    private clampOffset(offset: number, imageSize: number, viewportSize: number): number {
        if (imageSize <= viewportSize) {
            return (viewportSize - imageSize) / 2;
        }
        const minOffset = viewportSize - imageSize;
        return Math.min(Math.max(offset, minOffset), 0);
    }

    private scaledWidth(): number {
        return this.image.naturalWidth * this.scale;
    }

    private scaledHeight(): number {
        return this.image.naturalHeight * this.scale;
    }

    private viewportCentre(): Point {
        return { x: this.viewport.clientWidth / 2, y: this.viewport.clientHeight / 2 };
    }

    private toViewportPoint(event: MouseEvent): Point {
        const bounds = this.viewport.getBoundingClientRect();
        return { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
    }

    private pinchPoints(): Point[] {
        return Array.from(this.pointers.values());
    }

    private pinchDistance(): number {
        const [first, second] = this.pinchPoints();
        return Math.hypot(second.x - first.x, second.y - first.y);
    }

    private pinchCentre(): Point {
        const [first, second] = this.pinchPoints();
        return { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 };
    }
}

document.querySelectorAll<HTMLElement>(".zoom-figure").forEach((figure) => {
    new ZoomViewer(figure);
});
