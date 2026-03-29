export class IntermittentBarrier {
    constructor(config) {
        this.zones = config.zones || [];
        this.interval = config.interval || 8;
        this.initialDelay = config.initialDelay || 0;
        this.activeZoneIndex = config.activeZoneIndex || 0;
        
        this.timer = -this.initialDelay;
        this.graphics = [];
        // Guarda las medidas para dibujar en el primer update si no se hizo
        this._lastCx = 0;
        this._lastCy = 0;
    }

    initGraphics(PIXI, layer) {
        for (let i = 0; i < this.zones.length; i++) {
            const gfx = new PIXI.Graphics();
            this.graphics.push(gfx);
            layer.addChild(gfx);
        }
    }
    
    update(dt, cx, cy) {
        this.timer += dt;
        let needsRedraw = false;

        // Si cambiaron las dimensiones del mundo, forzar redibujado (responsive)
        if (cx !== this._lastCx || cy !== this._lastCy) {
            this._lastCx = cx;
            this._lastCy = cy;
            needsRedraw = true;
        }

        if (this.timer >= this.interval) {
            this.timer = 0;
            this.activeZoneIndex = (this.activeZoneIndex + 1) % this.zones.length;
            needsRedraw = true;
        }

        if (needsRedraw) {
            this._updateVisuals(cx, cy);
        }
    }

    _updateVisuals(cx, cy) {
        if (!cx || !cy) return;

        for (let i = 0; i < this.zones.length; i++) {
            const z = this.zones[i];
            const gfx = this.graphics[i];
            gfx.clear();

            const rx = z.x * cx;
            const ry = z.y * cy;
            const rw = z.width * cx;
            const rh = z.height * cy;
            const color = z.color !== undefined ? z.color : 0xff3366; 

            if (z.hidden) continue;

            if (i === this.activeZoneIndex) {
                // Estado Activo
                if (z.isHollow) {
                    const t = (z.thickness || 0.012) * cx; // Grosor de paredes
                    // Dibuja 4 paredes
                    gfx.rect(rx, ry, rw, t);
                    gfx.rect(rx, ry + rh - t, rw, t);
                    gfx.rect(rx, ry, t, rh);
                    gfx.rect(rx + rw - t, ry, t, rh);
                    gfx.fill({ color: color, alpha: 0.7 });
                    gfx.stroke({ color: color, alpha: 0.9, width: 2 });
                    
                    // Relleno sutil interno
                    gfx.rect(rx, ry, rw, rh);
                    gfx.fill({ color: color, alpha: 0.05 });
                } else {
                    // Bloqueo sólido tradicional
                    gfx.rect(rx, ry, rw, rh);
                    gfx.fill({ color: color, alpha: 0.35 });

                    gfx.rect(rx, ry, rw, rh);
                    gfx.stroke({ color: color, alpha: 0.9, width: 3 });
                    
                    if (rw > 6 && rh > 6) {
                        const inset = 4;
                        gfx.rect(rx + inset, ry + inset, rw - inset * 2, rh - inset * 2);
                        gfx.fill({ color: color, alpha: 0.2 });
                        gfx.stroke({ color: 0xffffff, alpha: 0.5, width: 1.5 });
                    }
                }
            } else {
                // Estado Inactivo: Solo sombreado marcando el pasillo
                gfx.rect(rx, ry, rw, rh);
                gfx.fill({ color: color, alpha: 0.08 });
                
                gfx.rect(rx, ry, rw, rh);
                gfx.stroke({ color: color, alpha: 0.3, width: 1 });
            }
        }
    }

    getActiveBounds() {
        if (this.activeZoneIndex >= 0 && this.activeZoneIndex < this.zones.length) {
            const z = this.zones[this.activeZoneIndex];
            if (z.hidden) return [];
            
            if (z.isHollow) {
                const t = z.thickness || 0.012;
                return [
                    { x: z.x, y: z.y, width: z.width, height: t, isHollowElement: true },
                    { x: z.x, y: z.y + z.height - t, width: z.width, height: t, isHollowElement: true },
                    { x: z.x, y: z.y, width: t, height: z.height, isHollowElement: true },
                    { x: z.x + z.width - t, y: z.y, width: t, height: z.height, isHollowElement: true }
                ];
            } else {
                return [z];
            }
        }
        return [];
    }
    
    destroy() {
        for (let g of this.graphics) {
            if (g && !g.destroyed) {
                if (g.parent) g.parent.removeChild(g);
                g.destroy();
            }
        }
        this.graphics = [];
    }
}
