import { ConnectorConfig, DataConnect, OperationOptions, ExecuteOperationResponse } from 'firebase-admin/data-connect';

export const connectorConfig: ConnectorConfig;

export type TimestampString = string;
export type UUIDString = string;
export type Int64String = string;
export type DateString = string;


export interface CreateProductData {
  inventoryItem_insert: InventoryItem_Key;
}

export interface CreateProductVariables {
  itemName: string;
  sku: string;
  costPrice: number;
  salePrice: number;
  currentStock: number;
  vatRate: number;
  description?: string | null;
}

export interface CreateTransactionData {
  transaction_insert: Transaction_Key;
}

export interface CreateTransactionVariables {
  description: string;
  amount: number;
  transactionType: string;
  vatAmount: number;
  referenceNumber?: string | null;
}

export interface InventoryItem_Key {
  id: UUIDString;
  __typename?: 'InventoryItem_Key';
}

export interface ListProductsData {
  inventoryItems: ({
    id: UUIDString;
    itemName: string;
    sku: string;
    salePrice: number;
    currentStock: number;
  } & InventoryItem_Key)[];
}

export interface Transaction_Key {
  id: UUIDString;
  __typename?: 'Transaction_Key';
}

export interface User_Key {
  id: UUIDString;
  __typename?: 'User_Key';
}

/** Generated Node Admin SDK operation action function for the 'ListProducts' Query. Allow users to execute without passing in DataConnect. */
export function listProducts(dc: DataConnect, options?: OperationOptions): Promise<ExecuteOperationResponse<ListProductsData>>;
/** Generated Node Admin SDK operation action function for the 'ListProducts' Query. Allow users to pass in custom DataConnect instances. */
export function listProducts(options?: OperationOptions): Promise<ExecuteOperationResponse<ListProductsData>>;

/** Generated Node Admin SDK operation action function for the 'CreateProduct' Mutation. Allow users to execute without passing in DataConnect. */
export function createProduct(dc: DataConnect, vars: CreateProductVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<CreateProductData>>;
/** Generated Node Admin SDK operation action function for the 'CreateProduct' Mutation. Allow users to pass in custom DataConnect instances. */
export function createProduct(vars: CreateProductVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<CreateProductData>>;

/** Generated Node Admin SDK operation action function for the 'CreateTransaction' Mutation. Allow users to execute without passing in DataConnect. */
export function createTransaction(dc: DataConnect, vars: CreateTransactionVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<CreateTransactionData>>;
/** Generated Node Admin SDK operation action function for the 'CreateTransaction' Mutation. Allow users to pass in custom DataConnect instances. */
export function createTransaction(vars: CreateTransactionVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<CreateTransactionData>>;

