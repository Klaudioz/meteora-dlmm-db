import { JupiterTokenListApi } from "./jupiter-token-list-api";
import { MeteoraDlmmApi } from "./meteora-dlmm-api";
import { parseMeteoraInstructions } from "./meteora-instruction-parser";
import { ParsedTransactionStream } from "./solana-transaction-utils";
export default class MeteoraDownloaderStream {
    get downloadComplete() {
        return (this._isDone &&
            !this._fetchingMissingPairs &&
            !this._fetchingMissingTokens &&
            !this._fetchingUsd);
    }
    get stats() {
        return {
            downloadingComplete: this.downloadComplete,
            secondsElapsed: (Date.now() - this._startTime) / 1000,
            accountSignatureCount: this._accountSignatureCount,
            positionCount: this._positionAddresses.size,
            positionTransactionCount: this._positionTransactionIds.size,
            usdPositionCount: this._usdPositionAddresses.size,
        };
    }
    constructor(db, endpoint, account, callbacks) {
        this._gotNewest = false;
        this._fetchingMissingPairs = false;
        this._fetchingMissingTokens = false;
        this._fetchingUsd = false;
        this._isDone = false;
        this._accountSignatureCount = 0;
        this._positionTransactionIds = new Set();
        this._positionAddresses = new Set();
        this._usdPositionAddresses = new Set();
        this._isComplete = false;
        this._db = db;
        this._account = account;
        this._isComplete = db.isComplete(this._account);
        this._onDone = callbacks?.onDone;
        this._startTime = Date.now();
        this._stream = ParsedTransactionStream.stream(endpoint, this._account, {
            oldestDate: new Date("11/06/2023"),
            oldestSignature: !this._isComplete
                ? this._db.getOldestSignature(this._account)
                : undefined,
            mostRecentSignature: this._db.getMostRecentSignature(this._account),
            onParsedTransactionsReceived: (transactions) => this._loadInstructions(transactions),
            onSignaturesReceived: (signatures) => this._onNewSignaturesReceived(signatures),
            onDone: () => {
                this._isDone = true;
                this._fetchMissingPairs();
            },
        });
    }
    async _loadInstructions(transactions) {
        let instructionCount = 0;
        const start = Date.now();
        transactions.forEach((transaction) => {
            parseMeteoraInstructions(transaction).forEach((instruction) => {
                this._db.addInstruction(instruction);
                instructionCount++;
                this._positionAddresses.add(instruction.accounts.position);
                this._positionTransactionIds.add(instruction.signature);
            });
        });
        await this._db.saveToFile("./livesave.db");
        const elapsed = Date.now() - start;
        console.log(`Added ${instructionCount} instructions in ${elapsed}ms`);
        this._fetchMissingPairs();
    }
    async _onNewSignaturesReceived(signatures) {
        this._accountSignatureCount += signatures.length;
        const newest = !this._gotNewest ? signatures[0].signature : undefined;
        this._gotNewest = true;
        const oldestSignature = signatures[signatures.length - 1].signature;
        const oldestDate = new Date(signatures[signatures.length - 1].blockTime * 1000).toDateString();
        const elapsed = Math.round((Date.now() - this._startTime) / 1000);
        console.log(`${elapsed}s - ${newest ? `Newest transaction: ${newest}, ` : ""}Oldest transaction (${oldestDate}): ${oldestSignature}`);
    }
    async _fetchMissingPairs() {
        if (this._fetchingMissingPairs) {
            return;
        }
        let missingPairs = this._db.getMissingPairs();
        if (missingPairs.length > 0) {
            this._fetchingMissingPairs = true;
            while (missingPairs.length > 0) {
                const address = missingPairs.shift();
                if (address) {
                    const missingPair = await MeteoraDlmmApi.getDlmmPairData(address);
                    this._db.addPair(missingPair);
                    console.log(`Added missing pair for ${missingPair.name}`);
                    missingPairs = this._db.getMissingPairs();
                }
            }
            this._fetchingMissingPairs = false;
        }
        this._fetchMissingTokens();
    }
    async _fetchMissingTokens() {
        if (this._fetchingMissingTokens) {
            return;
        }
        let missingTokens = this._db.getMissingTokens();
        if (missingTokens.length > 0) {
            this._fetchingMissingTokens = true;
            while (missingTokens.length > 0) {
                const address = missingTokens.shift();
                if (address) {
                    const missingToken = await JupiterTokenListApi.getToken(address);
                    if (missingToken) {
                        this._db.addToken(missingToken);
                        console.log(`Added missing token ${missingToken.symbol}`);
                    }
                    else {
                        throw new Error(`Token mint ${address} was not found in the Jupiter token list`);
                    }
                }
                missingTokens = this._db.getMissingTokens();
            }
            this._fetchingMissingTokens = false;
        }
        this._fetchUsd();
    }
    async _fetchUsd() {
        if (this._fetchingUsd) {
            return;
        }
        let missingUsd = this._db.getMissingUsd();
        if (missingUsd.length > 0) {
            this._fetchingUsd = true;
            while (missingUsd.length > 0) {
                const address = missingUsd.shift();
                if (address) {
                    this._usdPositionAddresses.add(address);
                    const usd = await MeteoraDlmmApi.getTransactions(address);
                    this._db.addUsdTransactions(address, usd);
                    const elapsed = Math.round((Date.now() - this._startTime) / 1000);
                    console.log(`${elapsed}s - Added USD transactions for position ${address}`);
                    await this._db.saveToFile("./livesave.db");
                }
                missingUsd = this._db.getMissingUsd();
                if (missingUsd.length > 0) {
                    console.log(`${missingUsd.length} positions remaining to load USD`);
                }
            }
            this._fetchingUsd = false;
        }
        this._finish();
    }
    _finish() {
        if (this._onDone && this.downloadComplete) {
            this._db.markComplete(this._account);
            this._onDone();
        }
    }
    cancel() {
        this._stream.cancel();
    }
}
