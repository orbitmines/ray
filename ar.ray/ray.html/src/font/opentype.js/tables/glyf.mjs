// The `glyf` table describes the glyphs in TrueType outline format.
// http://www.microsoft.com/typography/otspec/glyf.htm

import check from '../check.mjs';
import glyphset from '../glyphset.mjs';
import parse from '../parse.mjs';
import Path from '../path.mjs';

// Parse the coordinate data for a glyph.
function parseGlyphCoordinate(p, flag, previousValue, shortVectorBitMask, sameBitMask) {
    let v;
    if ((flag & shortVectorBitMask) > 0) {
        // The coordinate is 1 byte long.
        v = p.u8();
        // The `same` bit is re-used for short values to signify the sign of the value.
        if ((flag & sameBitMask) === 0) {
            v = -v;
        }

        v = previousValue + v;
    } else {
        //  The coordinate is 2 bytes long.
        // If the `same` bit is set, the coordinate is the same as the previous coordinate.
        if ((flag & sameBitMask) > 0) {
            v = previousValue;
        } else {
            // Parse the coordinate as a signed 16-bit delta value.
            v = previousValue + p.i16();
        }
    }

    return v;
}

// Parse a TrueType glyph.
function parseGlyph(glyph, data, start) {
    const p = new parse.Parser(data, start);
    glyph._numberOfContours = p.i16();
    glyph._xMin = p.i16();
    glyph._yMin = p.i16();
    glyph._xMax = p.i16();
    glyph._yMax = p.i16();
    let flags;
    let flag;

    if (glyph._numberOfContours > 0) {
        // This glyph is not a composite.
        const endPointIndices = glyph.endPointIndices = [];
        for (let i = 0; i < glyph._numberOfContours; i += 1) {
            endPointIndices.push(p.u16());
        }

        glyph.instructionLength = p.u16();
        glyph.instructions = [];
        for (let i = 0; i < glyph.instructionLength; i += 1) {
            glyph.instructions.push(p.u8());
        }

        const numberOfCoordinates = endPointIndices[endPointIndices.length - 1] + 1;
        flags = [];
        for (let i = 0; i < numberOfCoordinates; i += 1) {
            flag = p.u8();
            flags.push(flag);
            // If bit 3 is set, we repeat this flag n times, where n is the next byte.
            if ((flag & 8) > 0) {
                const repeatCount = p.u8();
                for (let j = 0; j < repeatCount; j += 1) {
                    flags.push(flag);
                    i += 1;
                }
            }
        }

        check.argument(flags.length === numberOfCoordinates, 'Bad flags.');

        if (endPointIndices.length > 0) {
            const points = [];
            let point;
            // X/Y coordinates are relative to the previous point, except for the first point which is relative to 0,0.
            if (numberOfCoordinates > 0) {
                for (let i = 0; i < numberOfCoordinates; i += 1) {
                    flag = flags[i];
                    point = {};
                    point.onCurve = !!(flag & 1);
                    point.lastPointOfContour = endPointIndices.indexOf(i) >= 0;
                    points.push(point);
                }

                let px = 0;
                for (let i = 0; i < numberOfCoordinates; i += 1) {
                    flag = flags[i];
                    point = points[i];
                    point.x = parseGlyphCoordinate(p, flag, px, 2, 16);
                    px = point.x;
                }

                let py = 0;
                for (let i = 0; i < numberOfCoordinates; i += 1) {
                    flag = flags[i];
                    point = points[i];
                    point.y = parseGlyphCoordinate(p, flag, py, 4, 32);
                    py = point.y;
                }
            }

            glyph.points = points;
        } else {
            glyph.points = [];
        }
    } else if (glyph.numberOfContours === 0) {
        glyph.points = [];
    } else {
        glyph.isComposite = true;
        glyph.points = [];
        glyph.components = [];
        let moreComponents = true;
        while (moreComponents) {
            flags = p.u16();
            const component = {
                glyphIndex: p.u16(),
                xScale: 1,
                scale01: 0,
                scale10: 0,
                yScale: 1,
                dx: 0,
                dy: 0
            };
            if ((flags & 1) > 0) {
                // The arguments are words
                if ((flags & 2) > 0) {
                    // values are offset
                    component.dx = p.i16();
                    component.dy = p.i16();
                } else {
                    // values are matched points
                    component.matchedPoints = [p.u16(), p.u16()];
                }

            } else {
                // The arguments are bytes
                if ((flags & 2) > 0) {
                    // values are offset
                    component.dx = p.i8();
                    component.dy = p.i8();
                } else {
                    // values are matched points
                    component.matchedPoints = [p.u8(), p.u8()];
                }
            }

            if ((flags & 8) > 0) {
                // We have a scale
                component.xScale = component.yScale = p.parseF2Dot14();
            } else if ((flags & 64) > 0) {
                // We have an X / Y scale
                component.xScale = p.parseF2Dot14();
                component.yScale = p.parseF2Dot14();
            } else if ((flags & 128) > 0) {
                // We have a 2x2 transformation
                component.xScale = p.parseF2Dot14();
                component.scale01 = p.parseF2Dot14();
                component.scale10 = p.parseF2Dot14();
                component.yScale = p.parseF2Dot14();
            }

            glyph.components.push(component);
            moreComponents = !!(flags & 32);
        }
        if (flags & 0x100) {
            // We have instructions
            glyph.instructionLength = p.u16();
            glyph.instructions = [];
            for (let i = 0; i < glyph.instructionLength; i += 1) {
                glyph.instructions.push(p.u8());
            }
        }
    }
}

// Transform an array of points and return a new array.
function transformPoints(points, transform) {
    const newPoints = [];
    for (let i = 0; i < points.length; i += 1) {
        const pt = points[i];
        const newPt = {
            x: transform.xScale * pt.x + transform.scale10 * pt.y + transform.dx,
            y: transform.scale01 * pt.x + transform.yScale * pt.y + transform.dy,
            onCurve: pt.onCurve,
            lastPointOfContour: pt.lastPointOfContour
        };
        newPoints.push(newPt);
    }

    return newPoints;
}

function getContours(points) {
    const contours = [];
    let currentContour = [];
    for (let i = 0; i < points.length; i += 1) {
        const pt = points[i];
        currentContour.push(pt);
        if (pt.lastPointOfContour) {
            contours.push(currentContour);
            currentContour = [];
        }
    }

    check.argument(currentContour.length === 0, 'There are still points left in the current contour.');
    return contours;
}

// Convert the TrueType glyph outline to a Path.
function getPath(points) {
    const p = new Path();
    if (!points) {
        return p;
    }

    const contours = getContours(points);

    for (let contourIndex = 0; contourIndex < contours.length; ++contourIndex) {
        const contour = contours[contourIndex];

        let curr = contour[contour.length - 1];
        let next = contour[0];

        if (curr.onCurve) {
            p.moveTo(curr.x, curr.y);
        } else {
            if (next.onCurve) {
                p.moveTo(next.x, next.y);
            } else {
                // If both first and last points are off-curve, start at their middle.
                const start = {x: (curr.x + next.x) * 0.5, y: (curr.y + next.y) * 0.5};
                p.moveTo(start.x, start.y);
            }
        }

        for (let i = 0; i < contour.length; ++i) {
            curr = next;
            next = contour[(i + 1) % contour.length];

            if (curr.onCurve) {
                // This is a straight line.
                p.lineTo(curr.x, curr.y);
            } else {
                let next2 = next;

                if (!next.onCurve) {
                    next2 = { x: (curr.x + next.x) * 0.5, y: (curr.y + next.y) * 0.5 };
                }

                p.quadraticCurveTo(curr.x, curr.y, next2.x, next2.y);
            }
        }

        p.closePath();
    }
    return p;
}

function buildPath(glyphs, glyph) {
    if (glyph.isComposite) {
        for (let j = 0; j < glyph.components.length; j += 1) {
            const component = glyph.components[j];
            const componentGlyph = glyphs.get(component.glyphIndex);
            // Force the ttfGlyphLoader to parse the glyph.
            componentGlyph.getPath();
            if (componentGlyph.points) {
                let transformedPoints;
                if (component.matchedPoints === undefined) {
                    // component positioned by offset
                    transformedPoints = transformPoints(componentGlyph.points, component);
                } else {
                    // component positioned by matched points
                    if ((component.matchedPoints[0] > glyph.points.length - 1) ||
                        (component.matchedPoints[1] > componentGlyph.points.length - 1)) {
                        throw Error('Matched points out of range in ' + glyph.name);
                    }
                    const firstPt = glyph.points[component.matchedPoints[0]];
                    let secondPt = componentGlyph.points[component.matchedPoints[1]];
                    const transform = {
                        xScale: component.xScale, scale01: component.scale01,
                        scale10: component.scale10, yScale: component.yScale,
                        dx: 0, dy: 0
                    };
                    secondPt = transformPoints([secondPt], transform)[0];
                    transform.dx = firstPt.x - secondPt.x;
                    transform.dy = firstPt.y - secondPt.y;
                    transformedPoints = transformPoints(componentGlyph.points, transform);
                }
                glyph.points = glyph.points.concat(transformedPoints);
            }
        }
    }

    return getPath(glyph.points);
}

function parseGlyfTableAll(data, start, loca, font) {
    const glyphs = new glyphset.GlyphSet(font);

    // The last element of the loca table is invalid.
    for (let i = 0; i < loca.length - 1; i += 1) {
        const offset = loca[i];
        const nextOffset = loca[i + 1];
        if (offset !== nextOffset) {
            glyphs.push(i, glyphset.ttfGlyphLoader(font, i, parseGlyph, data, start + offset, buildPath));
        } else {
            glyphs.push(i, glyphset.glyphLoader(font, i));
        }
    }

    return glyphs;
}

function parseGlyfTableOnLowMemory(data, start, loca, font) {
    const glyphs = new glyphset.GlyphSet(font);

    font._push = function(i) {
        const offset = loca[i];
        const nextOffset = loca[i + 1];
        if (offset !== nextOffset) {
            glyphs.push(i, glyphset.ttfGlyphLoader(font, i, parseGlyph, data, start + offset, buildPath));
        } else {
            glyphs.push(i, glyphset.glyphLoader(font, i));
        }
    };

    return glyphs;
}

// Parse all the glyphs according to the offsets from the `loca` table.
function parseGlyfTable(data, start, loca, font, opt) {
    if (opt.lowMemory)
        return parseGlyfTableOnLowMemory(data, start, loca, font);
    else
        return parseGlyfTableAll(data, start, loca, font);
}

export default { getPath, parse: parseGlyfTable};
export { getPath, transformPoints };