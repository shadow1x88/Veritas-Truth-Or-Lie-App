declare module "@wlearn/xgboost" {
  export class XGBModel {
    static create(params?: Record<string, unknown>): Promise<XGBModel>;
    static load(buffer: Uint8Array): Promise<XGBModel>;
    fit(x: number[][], y: number[]): XGBModel;
    predictProba(x: number[][]): Float64Array;
    save(): Uint8Array;
  }
}
