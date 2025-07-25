// The `post` table stores additional PostScript information, such as glyph names.
// https://www.microsoft.com/typography/OTSPEC/post.htm

import { standardNames } from '../encoding.mjs';
import parse from '../parse.mjs';
import table from '../table.mjs';

// Parse the PostScript `post` table
function parsePostTable(data, start) {
    const post = {};
    const p = new parse.Parser(data, start);
    post.version = p.parseVersion();
    post.italicAngle = p.parseFixed();
    post.underlinePosition = p.i16();
    post.underlineThickness = p.i16();
    post.isFixedPitch = p.u32();
    post.minMemType42 = p.u32();
    post.maxMemType42 = p.u32();
    post.minMemType1 = p.u32();
    post.maxMemType1 = p.u32();
    switch (post.version) {
        case 1:
            post.names = standardNames.slice();
            break;
        case 2:
            post.numberOfGlyphs = p.u16();
            post.glyphNameIndex = new Array(post.numberOfGlyphs);
            for (let i = 0; i < post.numberOfGlyphs; i++) {
                post.glyphNameIndex[i] = p.u16();
            }

            post.names = [];
            for (let i = 0; i < post.numberOfGlyphs; i++) {
                if (post.glyphNameIndex[i] >= standardNames.length) {
                    const nameLength = p.i8();
                    post.names.push(p.parseString(nameLength));
                }
            }

            break;
        case 2.5:
            post.numberOfGlyphs = p.u16();
            post.offset = new Array(post.numberOfGlyphs);
            for (let i = 0; i < post.numberOfGlyphs; i++) {
                post.offset[i] = p.i8();
            }

            break;
    }
    return post;
}

function makePostTable(font) {
    const {
        italicAngle = Math.round((font.italicAngle || 0) * 0x10000),
        underlinePosition = 0,
        underlineThickness = 0,
        isFixedPitch = 0,
        minMemType42 = 0,
        maxMemType42 = 0,
        minMemType1 = 0,
        maxMemType1 = 0
    } = font.tables.post || {};
    return new table.Table('post', [
        { name: 'version', type: 'FIXED', value: 0x00030000 },
        { name: 'italicAngle', type: 'FIXED', value: italicAngle },
        { name: 'underlinePosition', type: 'FWORD', value: underlinePosition },
        { name: 'underlineThickness', type: 'FWORD', value: underlineThickness },
        { name: 'isFixedPitch', type: 'ULONG', value: isFixedPitch },
        { name: 'minMemType42', type: 'ULONG', value: minMemType42 },
        { name: 'maxMemType42', type: 'ULONG', value: maxMemType42 },
        { name: 'minMemType1', type: 'ULONG', value: minMemType1 },
        { name: 'maxMemType1', type: 'ULONG', value: maxMemType1 }
    ]);
}

export default { parse: parsePostTable, make: makePostTable };
