/*
    Copyright (c) 2023 Alethea Katherine Flowers.
    Published under the standard MIT License.
    Full text available at: https://opensource.org/licenses/MIT
*/

import { first } from "../../base/iterator";
import { is_string } from "../../base/types";
import { DrawingSheet } from "../../kicad/drawing-sheet";
import { DrawingSheetPainter } from "../drawing-sheet/painter";
import { Grid } from "../base/grid";
import { Viewer } from "../base/viewer";
import { Canvas2DRenderer } from "../../graphics/canvas2d/renderer";
import { Renderer } from "../../graphics/renderer";
import * as theme from "../../kicad/theme";
import { BBox } from "../../base/math/bbox";
import { Vec2 } from "../../base/math/vec2";
import { KicadSch, SchematicSymbol } from "../../kicad/schematic";
import { LayerSet, LayerNames } from "./layers";
import { SchematicPainter } from "./painter";

export class SchematicViewer extends Viewer {
    schematic: KicadSch;
    drawing_sheet: DrawingSheet;
    #painter: SchematicPainter;
    #grid: Grid;

    override create_renderer(canvas: HTMLCanvasElement): Renderer {
        const renderer = new Canvas2DRenderer(canvas);
        renderer.theme = theme.schematic;
        renderer.state.fill = theme.schematic.note;
        renderer.state.stroke = theme.schematic.note;
        renderer.state.stroke_width = 0.1524;
        return renderer;
    }

    override async load(src: KicadSch) {
        if (this.schematic == src) {
            return;
        }

        this.schematic = src;

        // Load the default drawing sheet
        this.drawing_sheet = DrawingSheet.default();
        this.drawing_sheet.document = this.schematic;

        // Setup graphical layers
        this.disposables.disposeAndRemove(this.layers);
        this.layers = this.disposables.add(new LayerSet(this.renderer.theme));

        // Paint the schematic
        this.#painter = new SchematicPainter(
            this.renderer,
            this.layers as LayerSet,
        );
        this.#painter.paint(this.schematic);

        // Paint the drawing sheet
        new DrawingSheetPainter(this.renderer, this.layers as LayerSet).paint(
            this.drawing_sheet,
        );

        // Create the grid
        this.#grid = new Grid(
            this.renderer,
            this.viewport.camera,
            this.layers.by_name(LayerNames.grid)!,
            new Vec2(0, 0),
        );

        // Wait for a valid viewport size
        await this.viewport.ready;
        this.viewport.bounds = this.drawing_sheet.page_bbox.grow(50);

        // Position the camera and draw the scene.
        this.zoom_to_page();

        // Mark the viewer as loaded and notify event listeners
        this.set_loaded(true);
    }

    protected override on_viewport_change(): void {
        super.on_viewport_change();
        this.#grid?.update();
    }

    public override zoom_to_page(): void {
        this.viewport.camera.bbox = this.drawing_sheet.page_bbox.grow(10);
        this.draw();
    }

    public override select(
        value: SchematicSymbol | string | BBox | null,
    ): void {
        let item = value;

        // If item is a string, find the symbol by uuid or reference.
        if (is_string(item)) {
            item = this.schematic.find_symbol(item);
        }

        // If it's a symbol, find the bounding box for it.
        if (item instanceof SchematicSymbol) {
            const bboxes = this.layers.query_item_bboxes(item);
            item = first(bboxes) ?? null;
        }

        // If value wasn't explicitly null and none of the above found a suitable
        // selection, give up.
        if (value != null && !(item instanceof BBox)) {
            console.log(value, item);
            throw new Error(
                `Unable to select item ${value}, could not find an object that matched.`,
            );
        }

        this.selected = item ?? null;
    }
}