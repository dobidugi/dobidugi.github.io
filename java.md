---
layout: post
title: Java
permalink: /java
---
<ul class="">
    {% for post in site.posts %}
    {% if post.categories contains "java" %}
    <li>
        <h2><a href="{{ post.url }}">{{ post.title }}</a></h2>
        <p>{{ post.excerpt }}</p>
    </li>
    {% endif %}
    {% endfor%}
</ul>
