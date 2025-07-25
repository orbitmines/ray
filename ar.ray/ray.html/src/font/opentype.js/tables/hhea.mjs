// The `hhea` table contains information for horizontal layout.
// https://www.microsoft.com/typography/OTSPEC/hhea.htm

import parse from '../parse.mjs';
import table from '../table.mjs';

// Parse the horizontal header `hhea` table
function parseHheaTable(data, start) {
    const hhea = {};
    const p = new parse.Parser(data, start);
    hhea.version = p.parseVersion();
    hhea.ascender = p.i16();
    hhea.descender = p.i16();
    hhea.lineGap = p.i16();
    hhea.advanceWidthMax = p.u16();
    hhea.minLeftSideBearing = p.i16();
    hhea.minRightSideBearing = p.i16();
    hhea.xMaxExtent = p.i16();
    hhea.caretSlopeRise = p.i16();
    hhea.caretSlopeRun = p.i16();
    hhea.caretOffset = p.i16();
    p.relativeOffset += 8;
    hhea.metricDataFormat = p.i16();
    hhea.numberOfHMetrics = p.u16();
    return hhea;
}

function makeHheaTable(options) {
    return new table.Table('hhea', [
        {name: 'version', type: 'FIXED', value: 0x00010000},
        {name: 'ascender', type: 'FWORD', value: 0},
        {name: 'descender', type: 'FWORD', value: 0},
        {name: 'lineGap', type: 'FWORD', value: 0},
        {name: 'advanceWidthMax', type: 'UFWORD', value: 0},
        {name: 'minLeftSideBearing', type: 'FWORD', value: 0},
        {name: 'minRightSideBearing', type: 'FWORD', value: 0},
        {name: 'xMaxExtent', type: 'FWORD', value: 0},
        {name: 'caretSlopeRise', type: 'SHORT', value: 1},
        {name: 'caretSlopeRun', type: 'SHORT', value: 0},
        {name: 'caretOffset', type: 'SHORT', value: 0},
        {name: 'reserved1', type: 'SHORT', value: 0},
        {name: 'reserved2', type: 'SHORT', value: 0},
        {name: 'reserved3', type: 'SHORT', value: 0},
        {name: 'reserved4', type: 'SHORT', value: 0},
        {name: 'metricDataFormat', type: 'SHORT', value: 0},
        {name: 'numberOfHMetrics', type: 'USHORT', value: 0}
    ], options);
}

export default { parse: parseHheaTable, make: makeHheaTable };
