export declare class MessageBus {
    private _subscribers;
    onMessage(type: string, handler: jc.MessageHandler): jc.Unsubscribe;
    publishAsync<T extends jc.Message>(message: T): void;
    private _publishSingle;
    private _addSubscriber;
}
