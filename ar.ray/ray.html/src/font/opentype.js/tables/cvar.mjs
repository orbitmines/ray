// The `cvar` table stores variation data for CVT values
// https://learn.microsoft.com/en-us/typography/opentype/spec/cvar

import parse from '../parse.mjs';

function parseCvarTable(data, start, fvar, cvt) {
    const p = new parse.Parser(data, start);
    const cvtVariations = p.parseTupleVariationStore(
        p.relativeOffset,
        fvar.axes.length,
        'cvar',
        cvt
    );
    const tableVersionMajor = p.u16();
    const tableVersionMinor = p.u16();
    if (tableVersionMajor !== 1) {
        console.warn(`Unsupported cvar table version ${tableVersionMajor}.${tableVersionMinor}`);
    }

    return {
        version: [tableVersionMajor, tableVersionMinor],
        ...cvtVariations,
    };
}

function makeCvarTable(/*cvar*/) {
    console.warn('Writing of cvar tables is not yet supported.');
}

export default { make: makeCvarTable, parse: parseCvarTable };
