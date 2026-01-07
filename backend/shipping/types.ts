export interface Address {
  name: string;
  street1: string;
  street2?: string;
  city: string;
  state: string;
  zip: string;
  country: string;
  phone?: string;
}

export interface Parcel {
  length: number;
  width: number;
  height: number;
  weight: number;
}

export interface Label {
  id: string;
  tracking_code: string;
  tracking_url: string;
  label_url: string;
  carrier: string;
  service: string;
  rate: string;
}

export interface ShippingData {
  address: Address;
  parcel: Parcel;
}

export interface LabelRequest {
  fromAddress: Address;  // Seller's address
  toAddress: Address;    // Buyer's address
  parcel: Parcel;
}

export interface PrintOrder {
  orderId: string;
  buyerWallet: string;
  shipping: ShippingData;
  fileHash: string;
  escrowAmountEth: string;
  material: string;
  color: string;
  infill: number;
  createdAt: string;
}

export interface EncryptedShippingData {
  cid: string;
  accessControlConditions: string;
  encryptedSymmetricKey: string;
}
