//! Test-only checks tying each contract's projection to its output schema.
//!
//! The check is deliberately partial: it verifies the types, enums and required
//! keys a projection promises, and ignores unknown properties so that
//! forward-compatible additions do not fail the suite.

use super::ToolContract;
use serde_json::Value;

/// Asserts that a projected value satisfies the contract's output schema.
pub(super) fn assert_output_matches(contract: &ToolContract, value: &Value) {
    let Some(schema) = contract.tool.output_schema.as_ref() else {
        panic!("{} declares no output schema", contract.name);
    };
    assert!(
        matches(&Value::Object(schema.as_ref().clone()), value),
        "{} projection does not satisfy its output schema: {value}",
        contract.name
    );
}

/// Asserts that call-time acceptance and the declared input schema agree.
pub(super) fn assert_accepted_matches_declared(contract: &ToolContract) {
    let mut declared = contract
        .tool
        .input_schema
        .get("properties")
        .and_then(Value::as_object)
        .map(|properties| properties.keys().cloned().collect::<Vec<_>>())
        .unwrap_or_default();
    let mut accepted = contract
        .accepted
        .iter()
        .map(|field| (*field).to_owned())
        .collect::<Vec<_>>();
    declared.sort();
    accepted.sort();
    assert_eq!(
        declared, accepted,
        "{} accepted fields drifted from its declared input schema",
        contract.name
    );
}

fn matches(schema: &Value, value: &Value) -> bool {
    schema.as_object().is_none_or(|schema| {
        schema
            .get("anyOf")
            .and_then(Value::as_array)
            .is_none_or(|options| options.iter().any(|option| matches(option, value)))
            && schema
                .get("type")
                .is_none_or(|types| type_matches(types, value))
            && schema
                .get("enum")
                .and_then(Value::as_array)
                .is_none_or(|options| options.contains(value))
            && required_keys_present(schema, value)
            && properties_match(schema, value)
            && items_match(schema, value)
    })
}

fn type_matches(types: &Value, value: &Value) -> bool {
    match types {
        Value::String(name) => type_name_matches(name, value),
        Value::Array(names) => names.iter().any(|name| {
            name.as_str()
                .is_some_and(|name| type_name_matches(name, value))
        }),
        _ => true,
    }
}

fn type_name_matches(name: &str, value: &Value) -> bool {
    match name {
        "null" => value.is_null(),
        "boolean" => value.is_boolean(),
        "number" => value.is_number(),
        "integer" => value.as_i64().is_some() || value.as_u64().is_some(),
        "string" => value.is_string(),
        "array" => value.is_array(),
        "object" => value.is_object(),
        _ => true,
    }
}

fn required_keys_present(schema: &serde_json::Map<String, Value>, value: &Value) -> bool {
    match (schema.get("required"), value) {
        (Some(Value::Array(required)), Value::Object(object)) => required
            .iter()
            .all(|key| key.as_str().is_some_and(|key| object.contains_key(key))),
        _ => true,
    }
}

fn properties_match(schema: &serde_json::Map<String, Value>, value: &Value) -> bool {
    match (schema.get("properties"), value) {
        (Some(Value::Object(properties)), Value::Object(object)) => properties
            .iter()
            .all(|(key, property)| object.get(key).is_none_or(|field| matches(property, field))),
        _ => true,
    }
}

fn items_match(schema: &serde_json::Map<String, Value>, value: &Value) -> bool {
    match (schema.get("items"), value) {
        (Some(items), Value::Array(values)) => values.iter().all(|item| matches(items, item)),
        _ => true,
    }
}
