declare module 'js-aruco2/src/aruco.js' {
  type DictionaryRecord = {
    nBits: number;
    tau: number | null;
    codeList: Array<number | string | number[]>;
  };

  const moduleValue: {
    AR: {
      DICTIONARIES: Record<string, DictionaryRecord>;
    };
  };
  export default moduleValue;
}

declare module 'js-aruco2/src/dictionaries/aruco_4x4_1000.js';
declare module 'js-aruco2/src/dictionaries/aruco_5x5_1000.js';
declare module 'js-aruco2/src/dictionaries/aruco_6x6_1000.js';
declare module 'js-aruco2/src/dictionaries/aruco_7x7_1000.js';
