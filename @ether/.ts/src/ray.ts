import { Runtime, Text } from "./language2.ts";
import {Standard, Version} from "./version.ts";

new Runtime('Ray', (Version.scheme('E') as Standard).create(0, '2027-01-01', 0), ".ray")
  .frontend(Text, (target, input) => {
    
  })