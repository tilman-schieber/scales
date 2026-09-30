import struct, sys

def parse(path):
    d = open(path, 'rb').read()
    assert d[:4] == b'MThd'
    fmt, ntrk, div = struct.unpack('>HHH', d[8:14])
    pos = 14
    tracks = []
    while pos < len(d):
        cid, ln = d[pos:pos+4], struct.unpack('>I', d[pos+4:pos+8])[0]
        body = d[pos+8:pos+8+ln]; pos += 8 + ln
        if cid != b'MTrk': continue
        t, i, status = 0, 0, 0
        name, notes, on, meta = '', [], {}, []
        def vlq():
            nonlocal i
            v = 0
            while True:
                b = body[i]; i += 1
                v = (v << 7) | (b & 0x7f)
                if not b & 0x80: return v
        while i < len(body):
            t += vlq()
            b = body[i]
            if b & 0x80: status = b; i += 1
            if status == 0xff:
                typ = body[i]; i += 1; l = vlq(); data = body[i:i+l]; i += l
                if typ == 3: name = data.decode('latin1')
                elif typ == 0x51: meta.append((t, 'tempo', 60e6 / int.from_bytes(data, 'big')))
                elif typ == 0x58: meta.append((t, 'ts', f'{data[0]}/{2**data[1]}'))
            elif status in (0xf0, 0xf7):
                l = vlq(); i += l
            else:
                hi = status & 0xf0; ch = status & 0xf
                if hi in (0xc0, 0xd0): i += 1; continue
                a, v = body[i], body[i+1]; i += 2
                if hi == 0x90 and v > 0: on[(ch, a)] = (t, v)
                elif hi == 0x80 or (hi == 0x90 and v == 0):
                    if (ch, a) in on:
                        s, vel = on.pop((ch, a)); notes.append((s, a, t - s, vel, ch))
        tracks.append((name, sorted(notes), meta))
    return div, tracks

if __name__ == '__main__':
    div, tracks = parse(sys.argv[1])
    print('division', div)
    for k, (name, notes, meta) in enumerate(tracks):
        chans = sorted({n[4] for n in notes})
        print(k, repr(name), len(notes), 'notes', 'ch', chans, meta[:4], 'range', (min(n[1] for n in notes), max(n[1] for n in notes)) if notes else '', 'first', notes[0][0] if notes else '')
