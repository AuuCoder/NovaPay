declare module "@aws-sdk/client-kms" {
  export class KMSClient {
    constructor(config: { region?: string; endpoint?: string });
    send(command: unknown): Promise<{ Signature?: Uint8Array }>;
  }

  export class SignCommand {
    constructor(input: {
      KeyId: string;
      Message: Buffer | Uint8Array;
      MessageType: "RAW" | "DIGEST";
      SigningAlgorithm: string;
    });
  }
}
