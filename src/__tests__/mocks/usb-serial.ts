export const UsbSerial = {
    openSerial: () => Promise.resolve(),
    closeSerial: () => Promise.resolve(),
    readSerial: () => Promise.resolve(''),
    writeSerial: () => Promise.resolve(),
    registerReadCallback: () => { },
};
export default { UsbSerial };
