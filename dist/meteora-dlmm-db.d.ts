import { type MeteoraDlmmInstruction } from "./meteora-instruction-parser";
import { type MeteoraDlmmPairData, type MeteoraPositionTransactions } from "./meteora-dlmm-api";
import { type TokenMeta } from "./jupiter-token-list-api";
import MeteoraDlmmStream from "./meteora-dlmm-downloader";
export default class MeteoraDlmmDb {
    private _db;
    private _addInstructionStatement;
    private _addTransferStatement;
    private _addPairStatement;
    private _addTokenStatement;
    private _addUsdYStatement;
    private _addUsdXStatement;
    private _fillMissingUsdStatement;
    private _markCompleteStatement;
    private _downloaders;
    private constructor();
    static create(data?: ArrayLike<number> | Buffer | null): Promise<MeteoraDlmmDb>;
    private _init;
    private _createTables;
    private _createStatements;
    private _addInitialData;
    addInstruction(instruction: MeteoraDlmmInstruction): void;
    addTransfers(instruction: MeteoraDlmmInstruction): void;
    addPair(pair: MeteoraDlmmPairData): void;
    addToken(token: TokenMeta): void;
    addUsdTransactions(position_address: string, transactions: MeteoraPositionTransactions): void;
    markComplete($account_address: string): void;
    isComplete(account_address: string): boolean;
    download(endpoint: string, account: string, callbacks?: {
        onDone?: (...args: any[]) => any;
    }): MeteoraDlmmStream;
    getMissingPairs(): string[];
    getMissingTokens(): string[];
    getMissingUsd(): string[];
    getMostRecentSignature(owner_address: string): string | undefined;
    getOldestSignature(owner_address: string): string | undefined;
    cancelStream(account: string): void;
    private _getAll;
}
