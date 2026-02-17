import logging

from rest_framework.views import exception_handler

logger = logging.getLogger(__name__)


def custom_exception_handler(exc, context):
    response = exception_handler(exc, context)
    view = context.get('view')
    request = context.get('request')
    view_name = view.__class__.__name__ if view else 'UnknownView'
    path = request.path if request else 'unknown'
    method = request.method if request else 'unknown'

    if response is None:
        logger.exception(
            'Unhandled DRF exception: view=%s method=%s path=%s',
            view_name,
            method,
            path
        )
    elif response.status_code >= 500:
        logger.error(
            'Server error response: view=%s method=%s path=%s status=%s detail=%s',
            view_name,
            method,
            path,
            response.status_code,
            getattr(response, 'data', None)
        )
    elif response.status_code >= 400:
        logger.warning(
            'Client error response: view=%s method=%s path=%s status=%s detail=%s',
            view_name,
            method,
            path,
            response.status_code,
            getattr(response, 'data', None)
        )

    return response
