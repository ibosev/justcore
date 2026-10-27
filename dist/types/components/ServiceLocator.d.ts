export declare class ServiceLocator implements jc.ServiceLocator {
    private readonly container;
    private instantiationsStack;
    constructor();
    addService<S>(key: string, factory: () => S): void;
    getService<S>(key: string): S;
    private isServiceBeingInstantiated;
}
