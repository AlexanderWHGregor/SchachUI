import { Component, OnInit } from '@angular/core';
import { RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App implements OnInit {
  ngOnInit(): void {
    this.renderLabels();
    this.render();
    // White is AI — make the opening move
    setTimeout(() => this.triggerAiMove(), 400);
  }

  /* Piece constants */
  readonly PIECES = {
    wK:'♚', wQ:'♛', wR:'♜', wB:'♝', wN:'♞', wP:'♟',
    bK:'♔', bQ:'♕', bR:'♖', bB:'♗', bN:'♘', bP:'♙',
  };

  readonly INIT_BOARD = [
    'wR','wN','wB','wQ','wK','wB','wN','wR',
    'wP','wP','wP','wP','wP','wP','wP','wP',
    null,null,null,null,null,null,null,null,
    null,null,null,null,null,null,null,null,
    null,null,null,null,null,null,null,null,
    null,null,null,null,null,null,null,null,
    'bP','bP','bP','bP','bP','bP','bP','bP',
    'bR','bN','bB','bQ','bK','bB','bN','bR',
  ];

  signal(initVal: any) {
    let val = initVal;
    const subs = new Set();
    function read() { return val; }
    read.set = (v: any) => { val = v; subs.forEach(fn => fn); };
    read.update = (fn: any) => read.set(fn(val));
    read.subscribe = (fn: any) => { subs.add(fn); return () => subs.delete(fn); };
    return read;
  }

  computed(fn: any) {
    const c = this.signal(fn());
    return { read: () => { c.set(fn()); return c(); }, get: fn };
  }

  effect(fn: any) { fn(); }

  /* Game State (Signals) */
  readonly board$      = this.signal([...this.INIT_BOARD]);
  readonly turn$       = this.signal('w');
  readonly selected$   = this.signal(null);
  readonly legalMoves$ = this.signal([]);
  readonly lastMove$   = this.signal(null);
  readonly status$     = this.signal('playing');
  readonly moveHistory$ = this.signal([]);
  readonly capturedW$  = this.signal([]);
  readonly capturedB$  = this.signal([]);
  readonly boardHistory$ = this.signal([]);
  readonly castleRights$ = this.signal({ wK:true, wQ:true, bK:true, bQ:true });
  readonly enPassant$  = this.signal(null);

  /* Chess Logic */
  color(p: any) { return p ? p[0] : null; }
  type(p: any) { return p ? p.slice(1) : null; }
  idx(r: any, c: any) { return r * 8 + c; }
  row(i: any) { return Math.floor(i / 8); }
  col(i: any) { return i % 8; }

  getPseudoMoves(i: any, board: any, ep: any, castle: any) {
    const p = board[i]; if (!p) return [];
    const c = this.color(p), t = this.type(p);
    const moves = [];
    const opp = c === 'w' ? 'b' : 'w';
    const slide = (dirs: any) => {
      for (const [dr,dc] of dirs) {
        let r = this.row(i) + dr, col_ = this.col(i) + dc;
        while(r >= 0 && r < 8 && col_ >= 0 && col_ < 8) {
          const ti=this.idx(r, col_);
          if(this.color(board[ti]) === c) break;
          moves.push(ti);
          if(board[ti]) break;
          r += dr;
          col_ += dc;
        }
      }
    };
    const step = (dirs: any) => {
      for (const [dr,dc] of dirs) {
        const r = this.row(i) + dr, cl = this.col(i) + dc;
        if(r >= 0 && r < 8 && cl >= 0 && cl < 8) {
          const ti=this.idx(r,cl);
          if(this.color(board[ti]) !== c) moves.push(ti);
        }
      }
    };

    if(t === 'R') slide([[1, 0], [-1, 0], [0, 1], [0, -1]]);
    else if(t === 'B') slide([[1, 1], [1, -1], [-1, 1], [-1, -1]]);
    else if(t === 'Q') slide([[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]);
    else if(t === 'N') step([[2, 1], [2, -1], [-2, 1], [-2, -1], [1, 2], [1, -2], [-1, 2], [-1, -2]]);
    else if(t === 'K') {
      step([[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1],[-1, -1]]);
      // Castling
      const baseRow = c === 'w' ? 0 : 7;
      if(this.row(i) === baseRow && this.col(i) === 4) {
        if(castle[c + 'K'] && !board[this.idx(baseRow, 5)] && !board[this.idx(baseRow, 6)])
          moves.push(this.idx(baseRow, 6));
        if(castle[c + 'Q'] && !board[this.idx(baseRow, 3)] && !board[this.idx(baseRow, 2)] && !board[this.idx(baseRow, 1)])
          moves.push(this.idx(baseRow, 2));
      }
    }
    else if(t === 'P') {
      const dir = c === 'w' ? 1 : -1;
      const startRow = c === 'w' ? 1 : 6;
      const r1 = this.row(i) + dir, r2 = this.row(i) + 2 * dir;
      if(r1 >= 0 && r1 < 8) {
        if(!board[this.idx(r1, this.col(i))]) {
          moves.push(this.idx(r1, this.col(i)));
          if(this.row(i) === startRow && !board[this.idx(r2, this.col(i))]) moves.push(this.idx(r2, this.col(i)));
        }
        for(const dc of [-1, 1]) {
          const cl = this.col(i) + dc;
          if(cl >= 0 && cl < 8) {
            const ti = this.idx(r1, cl);
            if(this.color(board[ti]) === opp) moves.push(ti);
            else if(ep === ti) moves.push(ti);
          }
        }
      }
    }
    return moves;
  }

  findKing(board: any, c: any) {
    return board.findIndex((p: any) => p === c + 'K');
  }

  isAttacked(sq: any, byColor: any, board: any) {
    for(let i = 0; i < 64; i++) {
      if(this.color(board[i]) === byColor) {
        if(this.getPseudoMoves(i, board, null, {wK:false, wQ:false, bK:false, bQ:false}).includes(sq)) return true;
      }
    }
    return false;
  }

  getLegalMoves(from: any, board: any, turn: any, ep: any, castle: any) {
    const pseudo = this.getPseudoMoves(from, board, ep, castle);
    return pseudo.filter(to => {
      const nb = [...board];
      const p = nb[from];
      const t = this.type(p), c = this.color(p);

      // En passant capture
      if(t === 'P' && to === ep && !nb[to]) {
        const capRow = c === 'w' ? this.row(to) - 1 : this.row(to) + 1;
        nb[this.idx(capRow, this.col(to))] = null;
      }

      // Castling — check intermediate squares
      if(t === 'K') {
        const baseRow = c === 'w' ? 0 : 7;
        if(this.row(from) === baseRow && this.col(from) === 4 && Math.abs(this.col(to) - 4) === 2) {
          // must not be in check, or pass through check
          if(this.isAttacked(from, c === 'w' ? 'b' : 'w', board)) return false;
          const midCol = this.col(to) === 6 ? 5 : 3;
          if(this.isAttacked(this.idx(baseRow,midCol), c === 'w' ? 'b' : 'w', board)) return false;
          // move rook
          const rookFrom = this.col(to) === 6 ? this.idx(baseRow, 7) : this.idx(baseRow, 0);
          const rookTo = this.col(to) === 6 ? this.idx(baseRow, 5) : this.idx(baseRow, 3);
          nb[rookTo] = nb[rookFrom];
          nb[rookFrom] = null;
        }
      }

      nb[to] = nb[from]; nb[from] = null;
      const kingIdx = this.findKing(nb, c);
      return !this.isAttacked(kingIdx, c === 'w' ? 'b' : 'w', nb);
    });
  }

  toAlgebraic(from: any, to: any, board: any, promotion: any) {
    const files = 'abcdefgh';
    const ranks = '87654321';
    const p = board[from];
    const t = this.type(p);
    let notation = '';
    if(t === 'K' && Math.abs(this.col(to) - this.col(from)) === 2) {
      return this.col(to) === 6 ? 'O-O' : 'O-O-O';
    }
    if(t !== 'P') notation += t;
    else if(board[to] || to === this.enPassant$()) notation += files[this.col(from)];
    if(board[to]) notation += 'x';
    notation += files[this.col(to)] + ranks[this.row(to)];
    if(promotion) notation += '=' + promotion;
    return notation;
  }

  applyMove(from: any, to: any, promoType: any) {
    const board = [...this.board$()];
    const p = board[from];
    const c = this.color(p), t = this.type(p);
    const ep = this.enPassant$();
    const castle = {...this.castleRights$()};
    let captured = board[to];

    // En passant
    if(t === 'P' && to === ep && !board[to]) {
      const capRow = c === 'w' ? this.row(to) - 1 : this.row(to) + 1;
      const capIdx = this.idx(capRow, this.col(to));
      captured = board[capIdx];
      board[capIdx] = null;
    }

    // Castling — move rook
    if(t === 'K' && Math.abs(this.col(to) - this.col(from)) === 2) {
      const baseRow = c === 'w' ? 0 : 7;
      const rookFrom = this.col(to) === 6 ? this.idx(baseRow, 7) : this.idx(baseRow, 0);
      const rookTo = this.col(to) === 6 ? this.idx(baseRow, 5) : this.idx(baseRow, 3);
      board[rookTo] = board[rookFrom];
      board[rookFrom] = null;
    }

    // Move piece
    board[to] = promoType ? c + promoType : board[from];
    board[from] = null;

    // Update castle rights
    if(t === 'K') { castle[c + 'K'] = false; castle[c + 'Q'] = false; }
    if(t === 'R') {
      if(from === this.idx(0, 0)) castle['wQ'] = false;
      if(from === this.idx(0, 7)) castle['wK'] = false;
      if(from === this.idx(7, 0)) castle['bQ'] = false;
      if(from === this.idx(7, 7)) castle['bK'] = false;
    }

    // En passant target
    let newEp = null;
    if(t === 'P' && Math.abs(this.row(to) - this.row(from)) === 2) {
      newEp = this.idx((this.row(from) + this.row(to)) / 2, this.col(from));
    }

    return { board, captured, castle, newEp };
  }

  /* Algebraic move notation */
  moveToSan(from: any, to: any, board: any, promoType: any) {
    return this.toAlgebraic(from, to, board, promoType);
  }

  /* UI rendering */
  renderBoard() {
    const boardEl = document.getElementById('board');
    const board = this.board$();
    const sel = this.selected$();
    const legal = this.legalMoves$();
    const lm = this.lastMove$();
    const status = this.status$();
    const turn = this.turn$();
    const opp = turn==='w' ? 'b' : 'w';

    // Find kings in check
    let checkIdx = -1;
    if(status === 'check' || status === 'checkmate') {
      checkIdx = this.findKing(board, turn);
    }

    if (boardEl) boardEl.innerHTML = '';
    for(let i = 0; i < 64; i++) {
      const r = this.row(i), c = this.col(i);
      const isLight = (r + c) % 2 === 0;
      const p = board[i];
      const isSel = sel === i;
      const canMove = legal.includes(i);
      const isLastMove = lm && (lm.from === i || lm.to === i);
      const isCheck = i === checkIdx;
      const sq = document.createElement('div');
      sq.className = 'sq' + (isLight ? ' light' : ' dark')
        + (isSel ? ' selected' : '')
        + (canMove ? ' can-move' : '')
        + (canMove && p ? ' occupied' : '')
        + (isLastMove && !isSel ? ' last-move' : '')
        + (isCheck ? ' in-check' : '');

      if(p) {
        const pieceEl = document.createElement('div');
        pieceEl.className='piece';
        pieceEl.textContent=this.PIECES[p as keyof typeof this.PIECES];
        sq.appendChild(pieceEl);
      }

      sq.addEventListener('click', () => this.onSquareClick(i));
      if (boardEl) boardEl.appendChild(sq);
    }
  }

  renderLabels() {
    const rankLabels = document.getElementById('rankLabels');
    const fileLabels = document.getElementById('fileLabels');
    if (rankLabels) rankLabels.innerHTML = '';
    if (fileLabels) fileLabels.innerHTML = '';
    '87654321'.split('').forEach(r => {
      const el = document.createElement('span');
      el.textContent = r;
      if (rankLabels) rankLabels.appendChild(el);
    });
    'abcdefgh'.split('').forEach(f => {
      const el = document.createElement('span');
      el.textContent = f;
      if (fileLabels) fileLabels.appendChild(el);
    });
  }

  renderStatus() {
    const status = this.status$();
    const turn = this.turn$();
    const dotW = document.getElementById('dotW');
    const dotB = document.getElementById('dotB');
    const gameOverMsg = document.getElementById('gameOverMsg');

    if (dotW) dotW.className = 'dot white' + (turn === 'w' && status === 'playing' || status === 'check' && turn === 'w' ? ' active' : '');
    if (dotB) dotB.className = 'dot black' + (turn === 'b' && status === 'playing' || status === 'check' && turn === 'b' ? ' active' : '');

    if (status === 'checkmate') {
      const winner = turn === 'w' ? 'Black' : 'White';
      if (gameOverMsg) gameOverMsg.textContent = `Checkmate — ${winner} wins!`;
      if (gameOverMsg) gameOverMsg.style.display = 'block';
      if (dotW) dotW.className = 'dot white';
      if (dotB) dotB.className = 'dot black';
    } else if(status === 'stalemate') {
      if (gameOverMsg) gameOverMsg.textContent = 'Stalemate — Draw!';
      if (gameOverMsg) gameOverMsg.style.display = 'block';
    } else if(status === 'check') {
      if (gameOverMsg) gameOverMsg.style.display = 'none';
      if(turn==='w') if (dotW) dotW.className = 'dot white active';
      else if (dotB) dotB.className = 'dot black active';
    } else {
      if (gameOverMsg) gameOverMsg.style.display = 'none';
    }
  }

  renderCaptured() {
    document.getElementById('capturedByWhite')!.textContent=this.capturedW$().map((p: string | number)=>this.PIECES[p as keyof typeof this.PIECES]).join('');
    document.getElementById('capturedByBlack')!.textContent=this.capturedB$().map((p: string | number)=>this.PIECES[p as keyof typeof this.PIECES]).join('');
  }

  renderMoveHistory() {
    const hist = this.moveHistory$();
    const el = document.getElementById('moveHistory');
    if (el) el.innerHTML = '';
    hist.forEach((pair: any, i: any) => {
      const row = document.createElement('div');
      row.className = 'move-pair';
      row.innerHTML = `<span class="move-num">${i + 1}.</span><span class="move-w">${pair.w || ''}</span><span class="move-b">${pair.b || ''}</span>`;
      if (el) el.appendChild(row);
    });
    if (el) el.scrollTop = el.scrollHeight;
  }

  render() {
    this.renderBoard();
    this.renderStatus();
    this.renderCaptured();
    this.renderMoveHistory();
  }

  /* Interaction */
  pendingPromo: any;

  onSquareClick(i: any) {
    const status = this.status$();
    if(status === 'checkmate' || status === 'stalemate') return;

    const turn = this.turn$();
    // Human only controls Black
    if(turn === 'w') return;

    const sel = this.selected$();
    const board = this.board$();
    const legal = this.legalMoves$();

    if(sel !== null && legal.includes(i)) {
      // Execute move
      this.doMove(sel, i, null);
      return;
    }

    const p = board[i];
    if(p && this.color(p) === turn) {
      this.selected$.set(i);
      this.legalMoves$.set(this.getLegalMoves(i, board, turn, this.enPassant$(), this.castleRights$()));
    } else {
      this.selected$.set(null);
      this.legalMoves$.set([]);
    }
    this.render();
  }

  doMove(from: any, to: any, promoType: any) {
    const board = this.board$();
    const turn = this.turn$();
    const p = board[from];
    const t = this.type(p);

    // Pawn promotion
    if(t === 'P' && (this.row(to) === 7 || this.row(to) === 0) && !promoType) {
      this.pendingPromo = {from, to};
      this.showPromoModal(turn);
      return;
    }

    // Save history for undo
    this.boardHistory$.update((h: any) => [...h, {
      board:[...board],
      turn,
      ep:this.enPassant$(),
      castle:{...this.castleRights$()},
      capturedW:[...this.capturedW$()],
      capturedB:[...this.capturedB$()],
      moveHistory:[...this.moveHistory$()],
      lastMove:this.lastMove$(),
      status:this.status$()
    }]);

    const san=this.moveToSan(from, to, board, promoType);
    const {board:nb, captured, castle, newEp}=this.applyMove(from, to, promoType);

    this.board$.set(nb);
    this.castleRights$.set(castle);
    this.enPassant$.set(newEp);
    this.lastMove$.set({from,to});

    if(captured) {
      if(turn === 'w') this.capturedW$.update((c: any) => [...c, captured]);
      else this.capturedB$.update((c: any) => [...c, captured]);
    }

    // Record move
    const hist = this.moveHistory$();
    if(turn === 'w') {
      this.moveHistory$.update((h: any)=>[...h, {w:san, b:''}]);
    } else {
      const last=hist[hist.length-1];
      if(last &&! last.b) {
        this.moveHistory$.update((h: string | any[])=>[...h.slice(0,-1), {w:last.w, b:san}]);
      } else {
        this.moveHistory$.update((h: any)=>[...h, {w:'', b:san}]);
      }
    }

    const next = turn === 'w' ? 'b' : 'w';
    this.turn$.set(next);
    this.selected$.set(null);
    this.legalMoves$.set([]);

    // Check game status
    const nextLegal=this.getAllLegalMoves(nb, next, newEp, castle);
    const nextKing=this.findKing(nb, next);
    const inCheck=this.isAttacked(nextKing, turn, nb);

    if(nextLegal.length === 0) {
      this.status$.set(inCheck ? 'checkmate' : 'stalemate');
    } else {
      this.status$.set(inCheck ? 'check' : 'playing');
    }

    this.render();

    // If it is now White's turn and the game is still going, schedule AI move
    if (next === 'w' && this.status$() !== 'checkmate' && this.status$() !== 'stalemate') {
      setTimeout(() => this.triggerAiMove(), 300);
    }
  }

  getAllLegalMoves(board: any, turn: any, ep: any, castle: any) {
    const moves = [];
    for(let i = 0; i < 64; i++) {
      if(this.color(board[i]) === turn) {
        const m = this.getLegalMoves(i, board, turn, ep, castle);
        moves.push(...m);
      }
    }
    return moves;
  }

  showPromoModal(turn: any) {
    const modal = document.getElementById('promoModal');
    const piecesEl = document.getElementById('promoPieces');
    if (piecesEl) piecesEl.innerHTML = '';
    const types = ['Q', 'R', 'B', 'N'];
    types.forEach(t => {
      const btn = document.createElement('button');
      btn.className = 'promo-btn';
      btn.textContent = this.PIECES[turn + t as keyof typeof this.PIECES];
      btn.onclick = () => { this.hidePromoModal(); if (this.pendingPromo) this.doMove(this.pendingPromo.from, this.pendingPromo.to, t); };
      if (piecesEl) piecesEl.appendChild(btn);
    });
    if (modal) modal.style.display = 'flex';
  }

  hidePromoModal() {
    document.getElementById('promoModal')!.style.display = 'none';
  }

  /* AI (White) */
  /* Piece-square tables give the AI positional awareness */
  readonly PST: Record<string, number[]> = {
    P: [
       0,  0,  0,  0,  0,  0,  0,  0,
      50, 50, 50, 50, 50, 50, 50, 50,
      10, 10, 20, 30, 30, 20, 10, 10,
       5,  5, 10, 25, 25, 10,  5,  5,
       0,  0,  0, 20, 20,  0,  0,  0,
       5, -5,-10,  0,  0,-10, -5,  5,
       5, 10, 10,-20,-20, 10, 10,  5,
       0,  0,  0,  0,  0,  0,  0,  0,
    ],
    N: [
      -50,-40,-30,-30,-30,-30,-40,-50,
      -40,-20,  0,  0,  0,  0,-20,-40,
      -30,  0, 10, 15, 15, 10,  0,-30,
      -30,  5, 15, 20, 20, 15,  5,-30,
      -30,  0, 15, 20, 20, 15,  0,-30,
      -30,  5, 10, 15, 15, 10,  5,-30,
      -40,-20,  0,  5,  5,  0,-20,-40,
      -50,-40,-30,-30,-30,-30,-40,-50,
    ],
    B: [
      -20,-10,-10,-10,-10,-10,-10,-20,
      -10,  0,  0,  0,  0,  0,  0,-10,
      -10,  0,  5, 10, 10,  5,  0,-10,
      -10,  5,  5, 10, 10,  5,  5,-10,
      -10,  0, 10, 10, 10, 10,  0,-10,
      -10, 10, 10, 10, 10, 10, 10,-10,
      -10,  5,  0,  0,  0,  0,  5,-10,
      -20,-10,-10,-10,-10,-10,-10,-20,
    ],
    R: [
       0,  0,  0,  0,  0,  0,  0,  0,
       5, 10, 10, 10, 10, 10, 10,  5,
      -5,  0,  0,  0,  0,  0,  0, -5,
      -5,  0,  0,  0,  0,  0,  0, -5,
      -5,  0,  0,  0,  0,  0,  0, -5,
      -5,  0,  0,  0,  0,  0,  0, -5,
      -5,  0,  0,  0,  0,  0,  0, -5,
       0,  0,  0,  5,  5,  0,  0,  0,
    ],
    Q: [
      -20,-10,-10, -5, -5,-10,-10,-20,
      -10,  0,  0,  0,  0,  0,  0,-10,
      -10,  0,  5,  5,  5,  5,  0,-10,
       -5,  0,  5,  5,  5,  5,  0, -5,
        0,  0,  5,  5,  5,  5,  0, -5,
      -10,  5,  5,  5,  5,  5,  0,-10,
      -10,  0,  5,  0,  0,  0,  0,-10,
      -20,-10,-10, -5, -5,-10,-10,-20,
    ],
    K: [
      -30,-40,-40,-50,-50,-40,-40,-30,
      -30,-40,-40,-50,-50,-40,-40,-30,
      -30,-40,-40,-50,-50,-40,-40,-30,
      -30,-40,-40,-50,-50,-40,-40,-30,
      -20,-30,-30,-40,-40,-30,-30,-20,
      -10,-20,-20,-20,-20,-20,-20,-10,
       20, 20,  0,  0,  0,  0, 20, 20,
       20, 30, 10,  0,  0, 10, 30, 20,
    ],
  };

  readonly PIECE_VALUES: Record<string, number> = {
    P: 100, N: 320, B: 330, R: 500, Q: 900, K: 20000,
  };

  /** Static evaluation: positive = good for White */
  evaluate(board: any[]): number {
    let score = 0;
    for (let i = 0; i < 64; i++) {
      const p = board[i];
      if (!p) continue;
      const c = this.color(p), t = this.type(p) as string;
      const val = this.PIECE_VALUES[t] ?? 0;
      // PST index: white reads top-to-bottom (row 0 = rank 8), black mirrors
      const pstIdx = c === 'w' ? (7 - this.row(i)) * 8 + this.col(i) : i;
      const pst = (this.PST[t] ?? [])[pstIdx] ?? 0;
      score += c === 'w' ? val + pst : -(val + pst);
    }
    return score;
  }

  /** Minimax with alpha-beta pruning (depth 3) */
  minimax(
    board: any[], turn: string, ep: any, castle: any,
    depth: number, alpha: number, beta: number, maximizing: boolean
  ): number {
    if (depth === 0) return this.evaluate(board);

    const allMoves: [number, number][] = [];
    for (let i = 0; i < 64; i++) {
      if (this.color(board[i]) === turn) {
        for (const to of this.getLegalMoves(i, board, turn, ep, castle)) {
          allMoves.push([i, to]);
        }
      }
    }

    if (allMoves.length === 0) {
      const kingIdx = this.findKing(board, turn);
      const opp = turn === 'w' ? 'b' : 'w';
      return this.isAttacked(kingIdx, opp, board)
        ? (maximizing ? -100000 - depth : 100000 + depth)
        : 0; // stalemate
    }

    const next = turn === 'w' ? 'b' : 'w';
    if (maximizing) {
      let best = -Infinity;
      for (const [from, to] of allMoves) {
        const { board: nb, castle: nc, newEp } = this.applyMove_pure(from, to, null, board, castle, ep, turn);
        best = Math.max(best, this.minimax(nb, next, newEp, nc, depth - 1, alpha, beta, false));
        alpha = Math.max(alpha, best);
        if (beta <= alpha) break;
      }
      return best;
    } else {
      let best = Infinity;
      for (const [from, to] of allMoves) {
        const { board: nb, castle: nc, newEp } = this.applyMove_pure(from, to, null, board, castle, ep, turn);
        best = Math.min(best, this.minimax(nb, next, newEp, nc, depth - 1, alpha, beta, true));
        beta = Math.min(beta, best);
        if (beta <= alpha) break;
      }
      return best;
    }
  }

  /** Pure (stateless) version of applyMove for use inside minimax */
  applyMove_pure(from: number, to: number, promoType: any, board: any[], castle: any, ep: any, turn: string) {
    const nb = [...board];
    const p = nb[from];
    const c = this.color(p), t = this.type(p);
    const nc = { ...castle };
    let newEp: any = null;

    // En passant capture
    if (t === 'P' && to === ep && !nb[to]) {
      const capRow = c === 'w' ? this.row(to) - 1 : this.row(to) + 1;
      nb[this.idx(capRow, this.col(to))] = null;
    }

    // Castling — move rook
    if (t === 'K' && Math.abs(this.col(to) - this.col(from)) === 2) {
      const baseRow = c === 'w' ? 0 : 7;
      const rookFrom = this.col(to) === 6 ? this.idx(baseRow, 7) : this.idx(baseRow, 0);
      const rookTo   = this.col(to) === 6 ? this.idx(baseRow, 5) : this.idx(baseRow, 3);
      nb[rookTo] = nb[rookFrom];
      nb[rookFrom] = null;
    }

    // Promotion (auto-queen for AI)
    nb[to] = (t === 'P' && (this.row(to) === 7 || this.row(to) === 0)) ? c + (promoType ?? 'Q') : nb[from];
    nb[from] = null;

    // Castle rights
    if (t === 'K') { nc[c + 'K'] = false; nc[c + 'Q'] = false; }
    if (t === 'R') {
      if (from === this.idx(0, 0)) nc['wQ'] = false;
      if (from === this.idx(0, 7)) nc['wK'] = false;
      if (from === this.idx(7, 0)) nc['bQ'] = false;
      if (from === this.idx(7, 7)) nc['bK'] = false;
    }
    if (t === 'P' && Math.abs(this.row(to) - this.row(from)) === 2) {
      newEp = this.idx((this.row(from) + this.row(to)) / 2, this.col(from));
    }
    return { board: nb, castle: nc, newEp };
  }

  /** Pick the best move for White and execute it */
  triggerAiMove() {
    const status = this.status$();
    if (status === 'checkmate' || status === 'stalemate') return;
    if (this.turn$() !== 'w') return;

    const board = this.board$();
    const ep = this.enPassant$();
    const castle = this.castleRights$();
    const DEPTH = 3;

    let bestScore = -Infinity;
    let bestMove: [number, number] | null = null;

    for (let i = 0; i < 64; i++) {
      if (this.color(board[i]) !== 'w') continue;
      for (const to of this.getLegalMoves(i, board, 'w', ep, castle)) {
        const { board: nb, castle: nc, newEp } = this.applyMove_pure(i, to, null, board, castle, ep, 'w');
        const score = this.minimax(nb, 'b', newEp, nc, DEPTH - 1, -Infinity, Infinity, false);
        if (score > bestScore) { bestScore = score; bestMove = [i, to]; }
      }
    }

    if (bestMove) {
      const [from, to] = bestMove;
      const p = board[from];
      const isPromo = this.type(p) === 'P' && (this.row(to) === 0 || this.row(to) === 7);
      this.doMove(from, to, isPromo ? 'Q' : null);
    }
  }

  /* Controls */
  undoMove() {
    const hist = this.boardHistory$();
    if(!hist.length) return;
    const prev = hist[hist.length - 1];
    this.boardHistory$.update((h: string | any[]) => h.slice(0, -1));
    this.board$.set([...prev.board]);
    this.turn$.set(prev.turn);
    this.enPassant$.set(prev.ep);
    this.castleRights$.set({...prev.castle});
    this.capturedW$.set([...prev.capturedW]);
    this.capturedB$.set([...prev.capturedB]);
    this.moveHistory$.set([...prev.moveHistory]);
    this.lastMove$.set(prev.lastMove);
    this.status$.set(prev.status);
    this.selected$.set(null);
    this.legalMoves$.set([]);
    this.render();
  }

  newGame() {
    this.board$.set([...this.INIT_BOARD]);
    this.turn$.set('w');
    this.selected$.set(null);
    this.legalMoves$.set([]);
    this.lastMove$.set(null);
    this.status$.set('playing');
    this.moveHistory$.set([]);
    this.capturedW$.set([]);
    this.capturedB$.set([]);
    this.boardHistory$.set([]);
    this.castleRights$.set({wK:true, wQ:true, bK:true, bQ:true});
    this.enPassant$.set(null);
    this.hidePromoModal();
    this.render();
    // White (AI) plays first move
    setTimeout(() => this.triggerAiMove(), 400);
  }
}