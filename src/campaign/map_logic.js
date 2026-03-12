/**
 * MapLogic - Generación y reglas del mapa estratégico.
 */
export class MapLogic {
    constructor() {
        this.rings = 3; // Capas de anillos concéntricos
        this.nodesPerRing = 6; // Nodos por anillo (coincide con facciones)
    }

    generateMap() {
        const nodes = [];
        const connections = [];

        // 1. Crear el centro (El Gran Picnic)
        nodes.push({ id: 0, x: 0.5, y: 0.5, type: 'center', owner: 'neutral', name: 'El Gran Picnic' });

        // 2. Crear anillos concéntricos
        for (let r = 1; r <= this.rings; r++) {
            const distance = r * 0.12;
            for (let i = 0; i < this.nodesPerRing; i++) {
                const angle = (i * (360 / this.nodesPerRing)) * (Math.PI / 180);
                const x = 0.5 + Math.cos(angle) * distance;
                const y = 0.5 + Math.sin(angle) * distance;

                const id = nodes.length;
                let owner = 'neutral';

                // Los nodos del anillo exterior (r === this.rings) se asignan a facciones
                if (r === this.rings) {
                    owner = i; // Guardamos el índice de la facción
                }

                nodes.push({
                    id: id,
                    x: x,
                    y: y,
                    ring: r,
                    owner: owner,
                    type: 'territory',
                    name: `Territorio ${id}`
                });
            }
        }

        // 3. Generar conexiones (telaraña)

        // Conexiones del Centro (Ring 0) al Ring 1
        for (let i = 1; i <= this.nodesPerRing; i++) {
            connections.push({ from: 0, to: i });
        }

        // Conexiones entre anillos y dentro de anillos
        for (let r = 1; r <= this.rings; r++) {
            const firstInRing = 1 + (r - 1) * this.nodesPerRing;

            for (let i = 0; i < this.nodesPerRing; i++) {
                const currentId = firstInRing + i;

                // A. Conexión Radial (Mismo anillo)
                const nextId = firstInRing + (i + 1) % this.nodesPerRing;
                connections.push({ from: currentId, to: nextId });

                // B. Conexión Concéntrica (Hacia el anillo exterior)
                if (r < this.rings) {
                    const outerId = currentId + this.nodesPerRing;
                    connections.push({ from: currentId, to: outerId });
                }
            }
        }

        return { nodes, connections };
    }
}
