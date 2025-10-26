# GPT System Robustness Audit Playbook

This document defines a standardized set of prompts and configuration blocks for guiding a GPT-based agent through a comprehensive robustness audit. The guidance is organized into reusable instruction dictionaries that can be injected into the agent's context verbatim or adapted as needed.

## Basic Audit Instructions

```python
def generate_audit_instructions():
    instructions = {
        "audit_type": "system_robustness",
        "scope": {
            "components": ["core", "security", "infrastructure"],
            "depth": "comprehensive",
            "timeline": "historical_and_current"
        },
        "evaluation_criteria": {
            "security": ["vulnerabilities", "access_controls", "data_protection"],
            "performance": ["response_times", "resource_usage", "scaling"],
            "reliability": ["uptime", "error_rates", "recovery_procedures"]
        },
        "output_format": {
            "structure": "detailed_report",
            "sections": ["findings", "recommendations", "enhancements"],
            "metrics": ["quantitative", "qualitative"]
        }
    }
    return instructions
```

## Enhanced Audit Parameters

```python
def create_enhanced_audit_parameters():
    parameters = {
        "analysis_depth": {
            "code_review": "detailed",
            "configuration_audit": "thorough",
            "security_assessment": "penetration_testing",
            "performance_profiling": "comprehensive"
        },
        "risk_assessment": {
            "categories": ["critical", "high", "medium", "low"],
            "metrics": ["impact", "likelihood", "mitigation_effectiveness"]
        },
        "enhancement_evaluation": {
            "criteria": ["feasibility", "impact", "cost_benefit"],
            "prioritization": "must_should_could_wont"
        }
    }
    return parameters
```

## System Component Analysis

```python
def define_component_analysis():
    components = {
        "core_systems": {
            "evaluation_points": [
                "architecture_integrity",
                "data_consistency",
                "business_logic_validation",
                "state_management"
            ],
            "metrics": {
                "processing_latency": "ms",
                "error_rate": "percentage",
                "resource_utilization": "percentage"
            }
        },
        "security_controls": {
            "evaluation_points": [
                "authentication_strength",
                "authorization_effectiveness",
                "data_encryption",
                "access_logging"
            ],
            "metrics": {
                "authentication_success_rate": "percentage",
                "authorization_check_performance": "ms",
                "encryption_strength": "bits"
            }
        }
    }
    return components
```

## Enhancement Recommendation Guidelines

```python
def create_enhancement_guidelines():
    guidelines = {
        "recommendation_format": {
            "description": "clear_and_concise",
            "justification": "required",
            "implementation_steps": "detailed",
            "risk_assessment": "included",
            "cost_estimate": "required"
        },
        "priority_levels": {
            "critical": {
                "criteria": ["security_vulnerability", "data_integrity", "system_stability"],
                "implementation_timeline": "immediate"
            },
            "high": {
                "criteria": ["performance_impact", "user_experience", "compliance"],
                "implementation_timeline": "short_term"
            },
            "medium": {
                "criteria": ["enhancement", "optimization", "maintenance"],
                "implementation_timeline": "medium_term"
            }
        }
    }
    return guidelines
```

## Output Format Specifications

```python
def define_report_structure():
    structure = {
        "executive_summary": {
            "length": "1-2_pages",
            "content": ["key_findings", "critical_issues", "high_priority_recommendations"]
        },
        "detailed_findings": {
            "sections": [
                "system_architecture",
                "security_controls",
                "performance_metrics",
                "reliability_assessment"
            ],
            "format": "structured_with_evidence"
        },
        "recommendations": {
            "format": "prioritized_list",
            "details": ["implementation_steps", "resource_requirements", "expected_outcomes"]
        },
        "enhancement_proposals": {
            "format": "detailed_specifications",
            "sections": ["technical_design", "implementation_plan", "risk_assessment"]
        }
    }
    return structure
```

## Implementation Timeline

```python
def create_implementation_plan():
    timeline = {
        "critical_enhancements": {
            "implementation_window": "0-2_weeks",
            "verification_steps": ["testing", "validation", "documentation"],
            "review_requirements": ["security_audit", "performance_testing"]
        },
        "high_priority_enhancements": {
            "implementation_window": "2-6_weeks",
            "verification_steps": ["unit_testing", "integration_testing", "user_acceptance"],
            "review_requirements": ["code_review", "security_assessment"]
        },
        "medium_priority_enhancements": {
            "implementation_window": "6-12_weeks",
            "verification_steps": ["testing", "documentation", "training"],
            "review_requirements": ["technical_review", "stakeholder_approval"]
        }
    }
    return timeline
```

## Verification and Validation

```python
def define_verification_procedures():
    procedures = {
        "implementation_verification": {
            "steps": [
                "code_review",
                "unit_testing",
                "integration_testing",
                "security_testing",
                "performance_testing"
            ],
            "success_criteria": {
                "test_coverage": "90%",
                "security_compliance": "100%",
                "performance_metrics": "within_thresholds"
            }
        },
        "validation_procedures": {
            "steps": [
                "functional_validation",
                "security_validation",
                "performance_validation",
                "user_acceptance_testing"
            ],
            "documentation_requirements": {
                "test_results": "detailed",
                "validation_reports": "signed_off",
                "implementation_records": "complete"
            }
        }
    }
    return procedures
```

These blocks can be supplied individually or composed together to provide GPT agents with precise and comprehensive direction when auditing the robustness of a software system.
