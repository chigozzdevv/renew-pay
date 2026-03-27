pub fn is_nonzero_id(id: &[u8; 32]) -> bool {
    id.iter().any(|byte| *byte != 0)
}

pub fn is_nonzero_currency(code: &[u8; 8]) -> bool {
    code.iter().any(|byte| *byte != 0)
}
