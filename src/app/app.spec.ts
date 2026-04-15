class ChessLogic {
  color(p: any) { return p ? p[0] : null; }
  type(p: any)  { return p ? p.slice(1) : null; }
  idx(r: any, c: any) { return r * 8 + c; }
  row(i: any)   { return Math.floor(i / 8); }
  col(i: any)   { return i % 8; }

  readonly INIT_BOARD: (string | null)[] = [
    'wR','wN','wB','wQ','wK','wB','wN','wR',
    'wP','wP','wP','wP','wP','wP','wP','wP',
    null,null,null,null,null,null,null,null,
    null,null,null,null,null,null,null,null,
    null,null,null,null,null,null,null,null,
    null,null,null,null,null,null,null,null,
    'bP','bP','bP','bP','bP','bP','bP','bP',
    'bR','bN','bB','bQ','bK','bB','bN','bR',
  ];

  readonly NO_CASTLE = { wK: false, wQ: false, bK: false, bQ: false };
  readonly ALL_CASTLE = { wK: true,  wQ: true,  bK: true,  bQ: true  };

  /** Returns a blank 64-square board */
  emptyBoard(): (string | null)[] { return Array(64).fill(null); }

  getPseudoMoves(i: number, board: (string|null)[], ep: number|null, castle: any): number[] {
    const p = board[i]; if (!p) return [];
    const c = this.color(p), t = this.type(p);
    const moves: number[] = [];
    const opp = c === 'w' ? 'b' : 'w';

    const slide = (dirs: number[][]) => {
      for (const [dr, dc] of dirs) {
        let r = this.row(i) + dr, col_ = this.col(i) + dc;
        while (r >= 0 && r < 8 && col_ >= 0 && col_ < 8) {
          const ti = this.idx(r, col_);
          if (this.color(board[ti]) === c) break;
          moves.push(ti);
          if (board[ti]) break;
          r += dr; col_ += dc;
        }
      }
    };
    const step = (dirs: number[][]) => {
      for (const [dr, dc] of dirs) {
        const r = this.row(i) + dr, cl = this.col(i) + dc;
        if (r >= 0 && r < 8 && cl >= 0 && cl < 8) {
          const ti = this.idx(r, cl);
          if (this.color(board[ti]) !== c) moves.push(ti);
        }
      }
    };

    if (t === 'R') slide([[1,0],[-1,0],[0,1],[0,-1]]);
    else if (t === 'B') slide([[1,1],[1,-1],[-1,1],[-1,-1]]);
    else if (t === 'Q') slide([[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]);
    else if (t === 'N') step([[2,1],[2,-1],[-2,1],[-2,-1],[1,2],[1,-2],[-1,2],[-1,-2]]);
    else if (t === 'K') {
      step([[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]);
      const baseRow = c === 'w' ? 0 : 7;
      if (this.row(i) === baseRow && this.col(i) === 4) {
        if (castle[c+'K'] && !board[this.idx(baseRow,5)] && !board[this.idx(baseRow,6)])
          moves.push(this.idx(baseRow, 6));
        if (castle[c+'Q'] && !board[this.idx(baseRow,3)] && !board[this.idx(baseRow,2)] && !board[this.idx(baseRow,1)])
          moves.push(this.idx(baseRow, 2));
      }
    }
    else if (t === 'P') {
      const dir = c === 'w' ? 1 : -1;
      const startRow = c === 'w' ? 1 : 6;
      const r1 = this.row(i) + dir, r2 = this.row(i) + 2 * dir;
      if (r1 >= 0 && r1 < 8) {
        if (!board[this.idx(r1, this.col(i))]) {
          moves.push(this.idx(r1, this.col(i)));
          if (this.row(i) === startRow && !board[this.idx(r2, this.col(i))])
            moves.push(this.idx(r2, this.col(i)));
        }
        for (const dc of [-1, 1]) {
          const cl = this.col(i) + dc;
          if (cl >= 0 && cl < 8) {
            const ti = this.idx(r1, cl);
            if (this.color(board[ti]) === opp) moves.push(ti);
            else if (ep === ti) moves.push(ti);
          }
        }
      }
    }
    return moves;
  }

  findKing(board: (string|null)[], c: string): number {
    return board.findIndex(p => p === c + 'K');
  }

  isAttacked(sq: number, byColor: string, board: (string|null)[]): boolean {
    for (let i = 0; i < 64; i++) {
      if (this.color(board[i]) === byColor) {
        if (this.getPseudoMoves(i, board, null, this.NO_CASTLE).includes(sq)) return true;
      }
    }
    return false;
  }

  getLegalMoves(from: number, board: (string|null)[], turn: string, ep: number|null, castle: any): number[] {
    const pseudo = this.getPseudoMoves(from, board, ep, castle);
    return pseudo.filter(to => {
      const nb = [...board];
      const p = nb[from];
      const t = this.type(p), c = this.color(p);

      if (t === 'P' && to === ep && !nb[to]) {
        const capRow = c === 'w' ? this.row(to) - 1 : this.row(to) + 1;
        nb[this.idx(capRow, this.col(to))] = null;
      }
      if (t === 'K') {
        const baseRow = c === 'w' ? 0 : 7;
        if (this.row(from) === baseRow && this.col(from) === 4 && Math.abs(this.col(to) - 4) === 2) {
          if (this.isAttacked(from, c === 'w' ? 'b' : 'w', board)) return false;
          const midCol = this.col(to) === 6 ? 5 : 3;
          if (this.isAttacked(this.idx(baseRow, midCol), c === 'w' ? 'b' : 'w', board)) return false;
          const rookFrom = this.col(to) === 6 ? this.idx(baseRow, 7) : this.idx(baseRow, 0);
          const rookTo   = this.col(to) === 6 ? this.idx(baseRow, 5) : this.idx(baseRow, 3);
          nb[rookTo] = nb[rookFrom]; nb[rookFrom] = null;
        }
      }
      nb[to] = nb[from]; nb[from] = null;
      const kingIdx = this.findKing(nb, c!);
      return !this.isAttacked(kingIdx, c === 'w' ? 'b' : 'w', nb);
    });
  }

  getAllLegalMoves(board: (string|null)[], turn: string, ep: number|null, castle: any): number[] {
    const moves: number[] = [];
    for (let i = 0; i < 64; i++) {
      if (this.color(board[i]) === turn)
        moves.push(...this.getLegalMoves(i, board, turn, ep, castle));
    }
    return moves;
  }

  applyMove_pure(from: number, to: number, promoType: string|null,
                 board: (string|null)[], castle: any, ep: number|null, turn: string) {
    const nb = [...board];
    const p = nb[from];
    const c = this.color(p), t = this.type(p);
    const nc = { ...castle };
    let newEp: number|null = null;

    if (t === 'P' && to === ep && !nb[to]) {
      const capRow = c === 'w' ? this.row(to) - 1 : this.row(to) + 1;
      nb[this.idx(capRow, this.col(to))] = null;
    }
    if (t === 'K' && Math.abs(this.col(to) - this.col(from)) === 2) {
      const baseRow = c === 'w' ? 0 : 7;
      const rookFrom = this.col(to) === 6 ? this.idx(baseRow, 7) : this.idx(baseRow, 0);
      const rookTo   = this.col(to) === 6 ? this.idx(baseRow, 5) : this.idx(baseRow, 3);
      nb[rookTo] = nb[rookFrom]; nb[rookFrom] = null;
    }
    nb[to]   = (t === 'P' && (this.row(to) === 7 || this.row(to) === 0))
               ? c + (promoType ?? 'Q')
               : nb[from];
    nb[from] = null;

    if (t === 'K') { nc[c+'K'] = false; nc[c+'Q'] = false; }
    if (t === 'R') {
      if (from === this.idx(0, 0)) nc['wQ'] = false;
      if (from === this.idx(0, 7)) nc['wK'] = false;
      if (from === this.idx(7, 0)) nc['bQ'] = false;
      if (from === this.idx(7, 7)) nc['bK'] = false;
    }
    if (t === 'P' && Math.abs(this.row(to) - this.row(from)) === 2)
      newEp = this.idx((this.row(from) + this.row(to)) / 2, this.col(from));

    return { board: nb, castle: nc, newEp };
  }

  readonly PIECE_VALUES: Record<string, number> = {
    P: 100, N: 320, B: 330, R: 500, Q: 900, K: 20000,
  };

  evaluate(board: (string|null)[]): number {
    let score = 0;
    for (let i = 0; i < 64; i++) {
      const p = board[i]; if (!p) continue;
      const c = this.color(p), t = this.type(p) as string;
      const val = this.PIECE_VALUES[t] ?? 0;
      score += c === 'w' ? val : -val;
    }
    return score;
  }
}

/* Helpers */

const g = new ChessLogic();

/* Sorted array equality regardless of order */
function sameSquares(a: number[], b: number[]): boolean {
  return JSON.stringify([...a].sort((x,y)=>x-y)) ===
         JSON.stringify([...b].sort((x,y)=>x-y));
}

/* Coordinate helpers */

describe('Coordinate helpers', () => {
  test('idx converts row/col to flat index', () => {
    expect(g.idx(0, 0)).toBe(0);
    expect(g.idx(0, 7)).toBe(7);
    expect(g.idx(7, 7)).toBe(63);
    expect(g.idx(3, 4)).toBe(28);
  });

  test('row extracts the row from a flat index', () => {
    expect(g.row(0)).toBe(0);
    expect(g.row(7)).toBe(0);
    expect(g.row(8)).toBe(1);
    expect(g.row(63)).toBe(7);
  });

  test('col extracts the column from a flat index', () => {
    expect(g.col(0)).toBe(0);
    expect(g.col(7)).toBe(7);
    expect(g.col(8)).toBe(0);
    expect(g.col(63)).toBe(7);
  });

  test('color returns the piece colour prefix', () => {
    expect(g.color('wK')).toBe('w');
    expect(g.color('bP')).toBe('b');
    expect(g.color(null)).toBe(null);
  });

  test('type returns the piece type suffix', () => {
    expect(g.type('wK')).toBe('K');
    expect(g.type('bP')).toBe('P');
    expect(g.type(null)).toBe(null);
  });
});