import { shutdown } from "./testUtil";

export default async () => {
  // tslint:disable-next-line
  console.log("Shutting down Gel test cluster...");

  try {
    // @ts-ignore
    await shutdown(global.gelProc, global.gelConn);
  } finally {
    // tslint:disable-next-line
    console.log("Gel test cluster is down...");
  }
};
