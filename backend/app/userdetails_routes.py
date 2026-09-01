import logging
from datetime import datetime, timezone
from typing import Any

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pymongo import DESCENDING, MongoClient, ReturnDocument

from .config import settings
from .security import require_authenticated_user

logger = logging.getLogger("ravenslaw.userdetails")

userdetails_router = APIRouter(prefix="/api/userdetails", tags=["User Details"])


async def _read_json_body(request: Request) -> dict[str, Any]:
    try:
        body = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON body")

    if not isinstance(body, dict):
        raise HTTPException(status_code=400, detail="JSON body must be an object")

    return body


def _mongo_client() -> MongoClient:
    if not settings.MONGODB_URI:
        raise HTTPException(status_code=503, detail="MongoDB is not configured")
    return MongoClient(settings.MONGODB_URI, serverSelectionTimeoutMS=5000)


def _parse_object_id(raw_value: Any, field_name: str) -> ObjectId:
    if isinstance(raw_value, dict):
        raw_value = raw_value.get("_id")

    if not isinstance(raw_value, str) or not ObjectId.is_valid(raw_value):
        raise HTTPException(status_code=400, detail=f"Invalid {field_name}")

    return ObjectId(raw_value)


def _serialize_task(task_doc: dict[str, Any], case_lookup: dict[str, dict[str, Any]]) -> dict[str, Any]:
    payload = dict(task_doc)
    payload["_id"] = str(payload["_id"])

    case_id = payload.get("caseId")
    if isinstance(case_id, ObjectId):
        case_id_str = str(case_id)
        payload["caseId"] = case_lookup.get(case_id_str, {"_id": case_id_str})
    elif isinstance(case_id, dict) and case_id.get("_id"):
        payload["caseId"] = case_id
    else:
        payload["caseId"] = None

    for key in ("createdAt", "updatedAt"):
        if isinstance(payload.get(key), datetime):
            payload[key] = payload[key].isoformat()

    return payload


@userdetails_router.get("/tasks")
async def get_tasks(
    clerk_uid: str = Depends(require_authenticated_user),
    status: str = Query("pending", description="Task status filter: pending|completed"),
):
    if status not in {"pending", "completed"}:
        raise HTTPException(status_code=400, detail="Invalid task status")

    client = _mongo_client()
    try:
        db = client[settings.MONGODB_DB]
        task_collection = db["tasks"]
        case_collection = db["cases"]

        query: dict[str, Any] = {"status": status, "clerkUid": clerk_uid}

        task_docs = list(task_collection.find(query).sort("updatedAt", DESCENDING).limit(500))

        case_ids = [doc.get("caseId") for doc in task_docs if isinstance(doc.get("caseId"), ObjectId)]
        case_lookup: dict[str, dict[str, Any]] = {}
        if case_ids:
            case_docs = case_collection.find(
                {"_id": {"$in": case_ids}},
                {"fileNo": 1, "caseTitle": 1, "caseNo": 1, "status": 1},
            )
            case_lookup = {
                str(case_doc["_id"]): {
                    "_id": str(case_doc["_id"]),
                    "fileNo": case_doc.get("fileNo"),
                    "caseTitle": case_doc.get("caseTitle"),
                    "caseNo": case_doc.get("caseNo"),
                    "status": case_doc.get("status"),
                }
                for case_doc in case_docs
            }

        tasks = [_serialize_task(doc, case_lookup) for doc in task_docs]
        return {"success": True, "tasks": tasks}
    except HTTPException:
        raise
    except Exception:
        logger.exception("Failed to fetch tasks")
        raise HTTPException(status_code=500, detail="Failed to fetch tasks")
    finally:
        client.close()


@userdetails_router.post("/tasks")
async def create_task(request: Request, clerk_uid: str = Depends(require_authenticated_user)):
    body = await _read_json_body(request)
    logger.info("POST /api/userdetails/tasks body=%s", body)

    task_text = body.get("task")
    due_date = body.get("dueDate")
    if not isinstance(task_text, str) or len(task_text.strip()) < 2:
        raise HTTPException(status_code=400, detail="Task is required and must be at least 2 characters")
    if not due_date:
        raise HTTPException(status_code=400, detail="dueDate is required")

    now = datetime.now(timezone.utc)
    status = body.get("status")
    completed = body.get("completed")
    normalized_status = "completed" if completed is True else (status or "pending")
    if normalized_status not in {"pending", "completed"}:
        raise HTTPException(status_code=400, detail="Invalid status")

    client = _mongo_client()
    try:
        db = client[settings.MONGODB_DB]
        task_collection = db["tasks"]

        case_id = body.get("caseId")
        parsed_case_id = _parse_object_id(case_id, "caseId") if case_id else None

        task_doc = {
            "clerkUid": clerk_uid,
            "task": task_text.strip(),
            "caseId": parsed_case_id,
            "dueDate": due_date,
            "dueTime": body.get("dueTime", ""),
            "reminder": body.get("reminder"),
            "resourceType": body.get("resourceType", "None"),
            "resourceName": body.get("resourceName"),
            "fieldToShow": body.get("fieldToShow") or body.get("fieldsToShow"),
            "referenceFiles": body.get("referenceFiles") or [],
            "status": normalized_status,
            "taskCompletedRemarks": body.get("taskCompletedRemarks", ""),
            "priority": body.get("priority", "medium"),
            "category": body.get("category", "case-review"),
            "createdAt": now,
            "updatedAt": now,
        }

        insert_result = task_collection.insert_one(task_doc)
        task_id = str(insert_result.inserted_id)

        if parsed_case_id:
            db["cases"].update_one({"_id": parsed_case_id}, {"$addToSet": {"tasks": insert_result.inserted_id}})

        return {
            "success": True,
            "message": "Task added successfully",
            "taskId": task_id,
        }
    except HTTPException:
        raise
    except Exception:
        logger.exception("Failed to create task")
        raise HTTPException(status_code=500, detail="Failed to add task")
    finally:
        client.close()


@userdetails_router.put("/tasks")
async def update_task(request: Request, clerk_uid: str = Depends(require_authenticated_user)):
    body = await _read_json_body(request)
    logger.info("PUT /api/userdetails/tasks body=%s", body)

    raw_task_id = body.get("taskId") or body.get("_id")
    if not raw_task_id:
        raise HTTPException(status_code=400, detail="taskId is required")

    task_id = _parse_object_id(raw_task_id, "taskId")

    if "completed" in body and isinstance(body.get("completed"), bool):
        normalized_status = "completed" if body["completed"] else "pending"
    else:
        normalized_status = body.get("status")

    if normalized_status not in {"pending", "completed"}:
        raise HTTPException(status_code=400, detail="Either completed(boolean) or status(pending|completed) is required")

    allowed_fields = {
        "task",
        "dueDate",
        "dueTime",
        "reminder",
        "resourceType",
        "resourceName",
        "fieldToShow",
        "fieldsToShow",
        "referenceFiles",
        "taskCompletedRemarks",
        "priority",
        "category",
    }

    updates: dict[str, Any] = {
        key: body[key]
        for key in allowed_fields
        if key in body
    }

    if "fieldsToShow" in updates and "fieldToShow" not in updates:
        updates["fieldToShow"] = updates.pop("fieldsToShow")

    if "caseId" in body:
        updates["caseId"] = _parse_object_id(body.get("caseId"), "caseId") if body.get("caseId") else None

    updates["status"] = normalized_status
    updates["updatedAt"] = datetime.now(timezone.utc)

    client = _mongo_client()
    try:
        db = client[settings.MONGODB_DB]
        task_collection = db["tasks"]

        updated = task_collection.find_one_and_update(
            {"_id": task_id, "clerkUid": clerk_uid},
            {"$set": updates},
            return_document=ReturnDocument.AFTER,
        )

        if not updated:
            raise HTTPException(status_code=404, detail="Task not found")

        case_lookup: dict[str, dict[str, Any]] = {}
        if isinstance(updated.get("caseId"), ObjectId):
            case_doc = db["cases"].find_one(
                {"_id": updated["caseId"]},
                {"fileNo": 1, "caseTitle": 1, "caseNo": 1, "status": 1},
            )
            if case_doc:
                case_lookup[str(case_doc["_id"])] = {
                    "_id": str(case_doc["_id"]),
                    "fileNo": case_doc.get("fileNo"),
                    "caseTitle": case_doc.get("caseTitle"),
                    "caseNo": case_doc.get("caseNo"),
                    "status": case_doc.get("status"),
                }

        return {
            "success": True,
            "message": "Task updated successfully",
            "task": _serialize_task(updated, case_lookup),
        }
    except HTTPException:
        raise
    except Exception:
        logger.exception("Failed to update task")
        raise HTTPException(status_code=500, detail="Failed to update task")
    finally:
        client.close()


@userdetails_router.delete("/tasks")
async def delete_task(request: Request, clerk_uid: str = Depends(require_authenticated_user)):
    body = await _read_json_body(request)
    logger.info("DELETE /api/userdetails/tasks body=%s", body)

    raw_task_id = body.get("taskId") or body.get("_id")
    if not raw_task_id:
        raise HTTPException(status_code=400, detail="taskId is required")

    task_id = _parse_object_id(raw_task_id, "taskId")

    client = _mongo_client()
    try:
        db = client[settings.MONGODB_DB]
        task_collection = db["tasks"]

        task_doc = task_collection.find_one({"_id": task_id, "clerkUid": clerk_uid}, {"caseId": 1})
        if not task_doc:
            raise HTTPException(status_code=404, detail="Task not found")

        task_collection.delete_one({"_id": task_id, "clerkUid": clerk_uid})

        if isinstance(task_doc.get("caseId"), ObjectId):
            db["cases"].update_one({"_id": task_doc["caseId"]}, {"$pull": {"tasks": task_id}})

        return {"success": True, "message": "Task deleted successfully"}
    except HTTPException:
        raise
    except Exception:
        logger.exception("Failed to delete task")
        raise HTTPException(status_code=500, detail="Failed to delete task")
    finally:
        client.close()
