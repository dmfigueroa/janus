export type MoveItemFailureCode =
  | "not_found"
  | "duplicate"
  | "insertion_choice_required"
  | "no_parent_group";

export class MoveItemError {
  constructor(
    public message: string,
    public code: MoveItemFailureCode,
  ) {}
}
