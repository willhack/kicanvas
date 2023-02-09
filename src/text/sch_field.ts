/*
    Copyright (c) 2023 Alethea Katherine Flowers.
    Published under the standard MIT License.
    Full text available at: https://opensource.org/licenses/MIT
*/

import { Angle } from "../math/angle";
import { BBox } from "../math/bbox";
import { Matrix3 } from "../math/matrix3";
import { Vec2 } from "../math/vec2";
import { EDAText } from "./eda_text";
import type { HAlign, VAlign } from "./font";

type Parent = {
    position: Vec2;
    transform: Matrix3;
};

/**
 * Represents a symbol (or sheet) "field", such as the reference, value, or
 * other properties shown along with the symbol.
 *
 * This corresponds to and is roughly based on KiCAD's SCH_FIELD class.
 */
export class SchField extends EDAText {
    constructor(text: string, public parent?: Parent) {
        super(text);
    }

    override get shown_text() {
        if (this.text == "~") {
            return "";
        }
        return this.text;
    }

    override get draw_rotation() {
        let this_deg = this.text_angle.degrees;
        const parent_transform = this.parent?.transform ?? Matrix3.identity();

        // Note: this checks the parent's rotation based on its transform.
        // KiCAD represents transforms with a simple 2x2 matrix which
        // can be made from a Matrix3 using:
        // kicad_matrix = [
        //      m.elements[0], m.elements[1], m.elements[3], m.elements[4]];
        // KiCAD sets the transform of a symbol instance in
        // SCH_SEXPR_PARSER::parseSchematicSymbol() to one of four values
        // depending on the orientation:
        //
        // - 0 degs:   [ 1,  0,  0, -1] - note that y is bottom to top.
        // - 90 degs:  [ 0, -1, -1,  0]
        // - 180 degs: [-1,  0,  0,  1]
        // - 270 degs: [ 0,  1,  1,  0]
        //
        // This means that this code can check if the parent is rotated 90
        // or 270 degres by checking if transform[1] is 1 or -1. transform[1]
        // is the same as matrix[1], so we check that.

        if (Math.abs(parent_transform.elements[1]!) == 1) {
            if (this_deg == 0 || this_deg == 180) {
                this_deg = 90;
            } else {
                this_deg = 0;
            }
        }

        return Angle.from_degrees(this_deg);
    }

    get position(): Vec2 {
        if (this.parent) {
            let relative_pos = this.text_pos.sub(this.parent.position);
            relative_pos = this.parent.transform.transform(relative_pos);
            return relative_pos.add(this.parent.position);
        }
        return this.text_pos;
    }

    get bounding_box(): BBox {
        const bbox = this.get_text_box();

        console.log("initial bb", bbox);

        // adjust bounding box according to parent location
        const origin = this.parent?.position ?? new Vec2(0, 0);
        const pos = this.text_pos.sub(origin);
        let begin = bbox.start.sub(origin);
        let end = bbox.end.sub(origin);

        begin = this.text_angle.rotate_point(begin, pos);
        end = this.text_angle.rotate_point(end, pos);

        // adjust bounding box based on symbol tranform

        if (this.parent) {
            // Symbols have the y axis direction flipped, so the bounding
            // box must also be flipped.
            begin.y = mirror(begin.y, pos.y);
            end.y = mirror(end.y, pos.y);
        }

        // Note: Real identity matrix (without flipped y) is actually needed
        // here.
        const transform = this.parent?.transform ?? Matrix3.identity();

        bbox.start = transform.transform(begin);
        bbox.end = transform.transform(end);
        bbox.start = bbox.start.add(origin);

        return bbox;
    }

    get is_horiz_justify_flipped(): boolean {
        const center = this.bounding_box.center;
        const pos = this.position;
        const rot = this.draw_rotation.degrees;
        const is_vertical = rot == 90 || rot == 270;

        switch (this.h_align) {
            case "left":
                if (is_vertical) {
                    return center.y > pos.y;
                } else {
                    return center.x < pos.x;
                }
            case "right":
                if (is_vertical) {
                    return center.y < pos.y;
                } else {
                    return center.x > pos.x;
                }
            default:
                return false;
        }
    }

    get effective_horiz_justify(): HAlign {
        switch (this.h_align) {
            case "left":
                return this.is_horiz_justify_flipped ? "right" : "left";
            case "right":
                return this.is_horiz_justify_flipped ? "left" : "right";
            case "center":
                return "center";
        }
    }

    get is_vert_justify_flipped(): boolean {
        const center = this.bounding_box.center;
        const pos = this.position;
        const rot = this.draw_rotation.degrees;
        console.log("draw rot", rot, "center", center);
        const is_vertical = rot == 90 || rot == 270;

        switch (this.v_align) {
            case "top":
                if (is_vertical) {
                    return center.x < pos.y;
                } else {
                    return center.y < pos.y;
                }
            case "bottom":
                if (is_vertical) {
                    return center.x > pos.x;
                } else {
                    return center.y > pos.y;
                }
            default:
                return false;
        }
    }

    get effective_vert_justify(): VAlign {
        switch (this.v_align) {
            case "top":
                return this.is_vert_justify_flipped ? "bottom" : "top";
            case "bottom":
                return this.is_vert_justify_flipped ? "top" : "bottom";
            case "center":
                return "center";
        }
    }
}

function mirror(v: number, ref = 0): number {
    return -(v - ref) + ref;
}