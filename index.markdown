---
# Feel free to add content and custom Front Matter to this file.
# To modify the layout, see https://jekyllrb.com/docs/themes/#overriding-theme-defaults

layout: home
---

{% for category in site.categories %}
  <h1>{{ category[0] }}</h1>
  <ul>
    {% for post in category[1] %}
      <li><h2><a href="{{ post.url }}">{{ post.title }}</a></h2></li>
      {{ post.excerpt }}
    {% endfor %}
  </ul>
{% endfor %}