export class SpatialHashGrid {
    constructor(width, height, cellSize, maxEntities) {
        this.boundsWidth = width;
        this.boundsHeight = height;
        this.cellSize = cellSize;
        this.cols = Math.ceil(width / cellSize) + 1;
        this.rows = Math.ceil(height / cellSize) + 1;

        let numCells = this.cols * this.rows;
        this.head = new Int32Array(numCells);
        this.next = new Int32Array(maxEntities);

        this.head.fill(-1);

        this.surfaceStore = null;
        this.surfaceVisited = null;
        this.surfaceQueryStamp = 1;
    }

    clear() {
        this.head.fill(-1);
    }

    insert(unitIndex, x, y) {
        // Auto-expandir si el índice supera la capacidad del array
        if (unitIndex >= this.next.length) {
            const newNext = new Int32Array(unitIndex * 2);
            newNext.set(this.next);
            newNext.fill(-1, this.next.length);
            this.next = newNext;
        }

        let col = (x / this.cellSize) | 0;
        let row = (y / this.cellSize) | 0;

        if (col >= 0 && col < this.cols && row >= 0 && row < this.rows) {
            let cellIndex = col + (row * this.cols);
            this.next[unitIndex] = this.head[cellIndex];
            this.head[cellIndex] = unitIndex;
        }
    }

    /**
     * Encuentra entidades en un radio (px) alrededor de x,y.
     * Calcula dinámicamente cuántas celdas debe recorrer.
     */
    findNear(x, y, radius, outArray) {
        let colCenter = (x / this.cellSize) | 0;
        let rowCenter = (y / this.cellSize) | 0;

        // Calcular cuántas celdas cubrir según el radio (ej: 180px / 30px = 6 celdas)
        let cellRange = Math.ceil(radius / this.cellSize);

        outArray.length = 0;

        for (let rowOffset = -cellRange; rowOffset <= cellRange; rowOffset++) {
            for (let colOffset = -cellRange; colOffset <= cellRange; colOffset++) {
                let col = colCenter + colOffset;
                let row = rowCenter + rowOffset;

                if (col >= 0 && col < this.cols && row >= 0 && row < this.rows) {
                    let cellIndex = col + (row * this.cols);
                    let id = this.head[cellIndex];

                    // Recorrer TODA la lista enlazada de la celda (sin límite de 6)
                    while (id !== -1) {
                        outArray.push(id);
                        id = this.next[id];
                    }
                }
            }
        }
    }

    setSurfaceStore(surfaceStore) {
        this.surfaceStore = surfaceStore || null;
        if (surfaceStore && surfaceStore.surfaceCount > 0) {
            this.surfaceVisited = new Uint32Array(surfaceStore.surfaceCount);
            this.surfaceQueryStamp = 1;
        } else {
            this.surfaceVisited = null;
            this.surfaceQueryStamp = 1;
        }
    }

    findNearbySurfaces(x, y, radius, outArray) {
        outArray.length = 0;
        if (!this.surfaceStore || !this.surfaceVisited) return;

        const store = this.surfaceStore;
        const cellRange = Math.ceil(radius / this.cellSize);
        const colCenter = (x / this.cellSize) | 0;
        const rowCenter = (y / this.cellSize) | 0;

        this.surfaceQueryStamp++;
        if (this.surfaceQueryStamp === 0xffffffff) {
            this.surfaceVisited.fill(0);
            this.surfaceQueryStamp = 1;
        }

        for (let rowOffset = -cellRange; rowOffset <= cellRange; rowOffset++) {
            for (let colOffset = -cellRange; colOffset <= cellRange; colOffset++) {
                const col = colCenter + colOffset;
                const row = rowCenter + rowOffset;

                if (col < 0 || col >= store.cols || row < 0 || row >= store.rows) continue;

                const cellIndex = col + (row * store.cols);
                let link = store.surfaceCellHead[cellIndex];

                while (link !== -1) {
                    const surfaceIndex = store.surfaceCellSurface[link];
                    if (this.surfaceVisited[surfaceIndex] !== this.surfaceQueryStamp) {
                        this.surfaceVisited[surfaceIndex] = this.surfaceQueryStamp;
                        outArray.push(surfaceIndex);
                    }
                    link = store.surfaceCellNext[link];
                }
            }
        }
    }
}
