import type { LocalDate, LocalDateTime } from "gel";
import type { ScalarType } from "../typesystem";

export type $local_date = ScalarType<"cal::local_date", LocalDate>;
export type $local_datetime = ScalarType<"cal::local_datetime", LocalDateTime>;
