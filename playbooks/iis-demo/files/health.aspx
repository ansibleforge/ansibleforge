<%@ Page Language="C#" %>
<%@ Import Namespace="System.IO" %>
<%
    Response.ContentType = "text/plain";
    if (File.Exists(Server.MapPath("fail.flag"))) {
        Response.StatusCode = 500;
        Response.Write("UNHEALTHY");
    } else {
        Response.StatusCode = 200;
        Response.Write("OK");
    }
%>
